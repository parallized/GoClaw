import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AiProvider } from "../../domain/service-types";
import { env } from "../../config/env";
import { AppError, normalizeUpstreamServiceError } from "../../lib/errors";
import { logPlanExecution } from "../../lib/plan-execution";
import { buildAiApiUrl } from "./api-url";

const IS_DEV = process.env.NODE_ENV !== "production";
const __filename = fileURLToPath(import.meta.url);
const LOGS_DIR = join(dirname(__filename), "..", "..", "logs");

// const USER_AGENT = "GoClaw/0.1 (+https://local.dev)";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const REQUEST_PREVIEW_LIMIT = 180;
const STREAM_PROGRESS_CHAR_STEP = 120;
const STREAM_PROGRESS_CHUNK_STEP = 8;

interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface ChatCompletionRequestBody {
  model: string;
  temperature: number;
  stream: true;
  response_format: { type: "json_object" };
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
}

interface StreamProgressState {
  streamChunks: number;
  visibleChunks: number;
  visibleChars: number;
  hiddenChunks: number;
  hiddenChars: number;
  estimatedCompletionTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string | null;
  lastVisibleDelta?: string;
  lastLoggedVisibleChars: number;
  lastLoggedVisibleChunks: number;
  hasLoggedVisibleProgress: boolean;
  lastLoggedHiddenChars: number;
  lastLoggedHiddenChunks: number;
  hasLoggedThinkingProgress: boolean;
}

function sanitizePreviewText(value: string, limit = REQUEST_PREVIEW_LIMIT): string {
  const compact = value
    .replace(/\s+/g, " ")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/gi, "sk-***")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]")
    .trim();

  if (compact.length <= limit) {
    return compact;
  }

  return `${compact.slice(0, limit)}…`;
}

function buildRequestPreview(endpoint: string, body: ChatCompletionRequestBody): string {
  return JSON.stringify({
    endpoint,
    model: body.model,
    temperature: body.temperature,
    stream: body.stream,
    responseFormat: body.response_format.type,
    messages: body.messages.map((message) => ({
      role: message.role,
      contentLength: message.content.length,
      contentPreview: sanitizePreviewText(message.content)
    }))
  });
}

function estimateCompletionTokens(text: string): number {
  const compact = text.trim();
  if (!compact) {
    return 0;
  }

  const cjkLikeChars = (compact.match(/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g) ?? []).length;
  const latinWordTokens = (compact.match(/[A-Za-z0-9]+/g) ?? []).reduce(
    (sum, word) => sum + Math.max(1, Math.ceil(word.length / 4)),
    0
  );
  const punctuationTokens = (compact.match(/[^\sA-Za-z0-9\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g) ?? []).length;

  return cjkLikeChars + latinWordTokens + Math.ceil(punctuationTokens / 2);
}

function buildStreamProgressDetail(progress: StreamProgressState, phase: "partial" | "final"): string {
  const tokenInfo = progress.completionTokens !== undefined
    ? {
      promptTokens: progress.promptTokens,
      completionTokens: progress.completionTokens,
      totalTokens: progress.totalTokens
    }
    : {
      estimatedCompletionTokens: progress.estimatedCompletionTokens
    };

  return JSON.stringify({
    phase,
    streamChunks: progress.streamChunks,
    visibleChunks: progress.visibleChunks,
    visibleChars: progress.visibleChars,
    hiddenChunks: progress.hiddenChunks,
    hiddenChars: progress.hiddenChars,
    ...tokenInfo,
    lastVisiblePreview: progress.lastVisibleDelta ? sanitizePreviewText(progress.lastVisibleDelta, 72) : undefined,
    finishReason: progress.finishReason ?? undefined
  });
}

function buildThinkingProgressDetail(progress: StreamProgressState): string {
  return JSON.stringify({
    phase: "thinking",
    streamChunks: progress.streamChunks,
    hiddenChunks: progress.hiddenChunks,
    hiddenChars: progress.hiddenChars
  });
}

function shouldLogVisibleProgress(progress: StreamProgressState): boolean {
  if (!progress.visibleChars) {
    return false;
  }

  if (!progress.hasLoggedVisibleProgress) {
    return true;
  }

  return progress.visibleChars - progress.lastLoggedVisibleChars >= STREAM_PROGRESS_CHAR_STEP
    || progress.visibleChunks - progress.lastLoggedVisibleChunks >= STREAM_PROGRESS_CHUNK_STEP;
}

function markVisibleProgressLogged(progress: StreamProgressState) {
  progress.hasLoggedVisibleProgress = true;
  progress.lastLoggedVisibleChars = progress.visibleChars;
  progress.lastLoggedVisibleChunks = progress.visibleChunks;
}

function shouldLogThinkingProgress(progress: StreamProgressState): boolean {
  if (!progress.hiddenChars) {
    return false;
  }

  if (!progress.hasLoggedThinkingProgress) {
    return true;
  }

  return progress.hiddenChars - progress.lastLoggedHiddenChars >= STREAM_PROGRESS_CHAR_STEP
    || progress.hiddenChunks - progress.lastLoggedHiddenChunks >= STREAM_PROGRESS_CHUNK_STEP;
}

function markThinkingProgressLogged(progress: StreamProgressState) {
  progress.hasLoggedThinkingProgress = true;
  progress.lastLoggedHiddenChars = progress.hiddenChars;
  progress.lastLoggedHiddenChunks = progress.hiddenChunks;
}

function extractVisibleDelta(
  delta: string,
  state: { insideThink: boolean }
): { visible: string; hiddenChars: number } {
  let visible = "";
  let hiddenChars = 0;

  for (let i = 0; i < delta.length; i++) {
    if (!state.insideThink && delta.startsWith("<think>", i)) {
      state.insideThink = true;
      i += 6;
    } else if (state.insideThink && delta.startsWith("</think>", i)) {
      state.insideThink = false;
      i += 7;
    } else if (state.insideThink) {
      hiddenChars += 1;
    } else if (!state.insideThink) {
      visible += delta[i];
    }
  }

  return { visible, hiddenChars };
}

function createAbortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

async function readChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(createAbortError("AI 流式响应超时"));
        }, idleTimeoutMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function writeDevLog(
  input: { system: string; user: string; temperature?: number },
  streamResult: string
): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logDir = join(LOGS_DIR, timestamp);
    await mkdir(logDir, { recursive: true });

    const inputContent = [
      "=== System Prompt ===",
      "",
      input.system,
      "",
      "",
      "=== User Prompt ===",
      "",
      input.user,
      "",
      "",
      "=== Temperature ===",
      "",
      String(input.temperature ?? 0.3),
    ].join("\n");

    await writeFile(join(logDir, "input.txt"), inputContent, "utf-8");
    await writeFile(join(logDir, "stream.txt"), streamResult, "utf-8");
  } catch {
    // logging is best-effort, never block the main flow
  }
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai-compatible";

  async generateText(input: { system: string; user: string; temperature?: number }): Promise<string> {
    if (!env.aiApiKey) {
      throw new AppError("未配置 AI_API_KEY", 500);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      let requestTimeout: ReturnType<typeof setTimeout> | undefined = setTimeout(
        () => controller.abort(),
        env.aiTimeoutMs
      );

      try {
        const endpoint = buildAiApiUrl(env.aiBaseUrl, "/chat/completions");
        const requestBody: ChatCompletionRequestBody = {
          model: env.aiModel,
          temperature: input.temperature ?? 0.3,
          stream: true,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user }
          ]
        };

        logPlanExecution(
          "info",
          `开始请求 AI 服务（第 ${attempt + 1} 次）`,
          JSON.stringify({ endpoint, model: requestBody.model })
        );
        logPlanExecution("info", "AI 请求载荷（已脱敏）", buildRequestPreview(endpoint, requestBody));

        const response = await fetch(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${env.aiApiKey}`,
            "content-type": "application/json",
            // "user-agent": USER_AGENT
          },
          body: JSON.stringify(requestBody)
        });
        if (requestTimeout !== undefined) {
          clearTimeout(requestTimeout);
          requestTimeout = undefined;
        }

        if (response.status === 429 && attempt < MAX_RETRIES) {
          logPlanExecution("warn", `AI 服务限流，准备重试（第 ${attempt + 1} 次）`);
          const ra = response.headers.get("retry-after");
          const delaySecs = ra ? Number(ra) : undefined;
          const delayMs = (delaySecs && Number.isFinite(delaySecs))
            ? delaySecs * 1000
            : BASE_DELAY_MS * 2 ** attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        if (!response.ok) {
          logPlanExecution("warn", `AI 服务返回非成功状态：${response.status} ${response.statusText}`);
          throw new AppError(`请求外部服务失败：${response.status} ${response.statusText}`, 502);
        }

        const content = await this.readStream(response, env.aiTimeoutMs);
        if (!content) {
          logPlanExecution("warn", "AI 服务返回空内容");
          throw new AppError("AI 服务未返回内容", 502);
        }

        logPlanExecution("info", `AI 服务返回成功，文本长度 ${content.length}`);

        if (IS_DEV) {
          await writeDevLog(input, content);
        }

        return content;
      } catch (error) {
        lastError = error;
        logPlanExecution("warn", "AI 请求失败", error instanceof Error ? error.message : String(error));
        const normalized = normalizeUpstreamServiceError(error, {
          timeoutMessage: "AI 服务响应超时，请稍后重试。",
          certificateMessage: "AI 服务证书校验失败，请稍后重试。",
          networkMessage: "AI 服务网络连接失败，请稍后重试。"
        });

        if (normalized instanceof AppError && normalized.status === 504) {
          if (attempt < MAX_RETRIES) {
            logPlanExecution("warn", `AI 请求超时，准备重试（第 ${attempt + 1} 次）`);
            await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * 2 ** attempt));
            continue;
          }
        }

        throw normalized;
      } finally {
        if (requestTimeout !== undefined) {
          clearTimeout(requestTimeout);
        }
      }
    }

    throw lastError;
  }

  private async readStream(response: Response, idleTimeoutMs: number): Promise<string> {
    const body = response.body;
    if (!body) {
      throw new AppError("AI 服务返回空响应体", 502);
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = "";
    const thinkState = { insideThink: false };
    const progress: StreamProgressState = {
      streamChunks: 0,
      visibleChunks: 0,
      visibleChars: 0,
      hiddenChunks: 0,
      hiddenChars: 0,
      estimatedCompletionTokens: 0,
      lastLoggedVisibleChars: 0,
      lastLoggedVisibleChunks: 0,
      hasLoggedVisibleProgress: false,
      lastLoggedHiddenChars: 0,
      lastLoggedHiddenChunks: 0,
      hasLoggedThinkingProgress: false
    };

    try {
      while (true) {
        const { done, value } = await readChunkWithIdleTimeout(reader, idleTimeoutMs);
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) {
            continue;
          }

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            continue;
          }

          try {
            const chunk: StreamChunk = JSON.parse(data);
            progress.streamChunks += 1;

            if (chunk.usage) {
              progress.promptTokens = chunk.usage.prompt_tokens;
              progress.completionTokens = chunk.usage.completion_tokens;
              progress.totalTokens = chunk.usage.total_tokens;
            }

            const choice = chunk.choices?.[0];
            if (choice?.finish_reason) {
              progress.finishReason = choice.finish_reason;
            }

            const delta = choice?.delta?.content ?? "";
            const { visible: visibleDelta, hiddenChars } = extractVisibleDelta(delta, thinkState);
            if (hiddenChars > 0) {
              progress.hiddenChunks += 1;
              progress.hiddenChars += hiddenChars;

              if (!progress.visibleChars && shouldLogThinkingProgress(progress)) {
                logPlanExecution("info", "AI 推理中", buildThinkingProgressDetail(progress));
                markThinkingProgressLogged(progress);
              }
            }

            if (!visibleDelta) {
              continue;
            }

            result += visibleDelta;
            progress.visibleChunks += 1;
            progress.visibleChars = result.length;
            progress.estimatedCompletionTokens = estimateCompletionTokens(result);
            progress.lastVisibleDelta = visibleDelta;

            if (shouldLogVisibleProgress(progress)) {
              logPlanExecution("info", "AI 流式输出接收中", buildStreamProgressDetail(progress, "partial"));
              markVisibleProgressLogged(progress);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (error) {
      await reader.cancel("AI stream aborted").catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }

    if (progress.streamChunks > 0) {
      logPlanExecution("info", "AI 流式响应结束", buildStreamProgressDetail(progress, "final"));
    }

    return result.trim();
  }
}
