import type { AiProvider } from "../../domain/service-types";
import { env } from "../../config/env";
import { AppError, normalizeUpstreamServiceError } from "../../lib/errors";
import { logPlanExecution } from "../../lib/plan-execution";
import { buildAiApiUrl } from "./api-url";

const USER_AGENT = "GoClaw/0.1 (+https://local.dev)";
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

interface StreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
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
      const timeout = setTimeout(() => controller.abort(), env.aiTimeoutMs);

      try {
        logPlanExecution("info", `开始请求 AI 服务（第 ${attempt + 1} 次）`, env.aiModel);
        const response = await fetch(buildAiApiUrl(env.aiBaseUrl, "/chat/completions"), {
          method: "POST",
          signal: controller.signal,
          headers: {
            "authorization": `Bearer ${env.aiApiKey}`,
            "content-type": "application/json",
            "user-agent": USER_AGENT
          },
          body: JSON.stringify({
            model: env.aiModel,
            temperature: input.temperature ?? 0.3,
            stream: true,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.user }
            ]
          })
        });

        if (response.status === 429 && attempt < MAX_RETRIES) {
          logPlanExecution("warn", `AI 服务限流，准备重试（第 ${attempt + 1} 次）`);
          const ra = response.headers.get("retry-after");
          const delaySecs = ra ? Number(ra) : undefined;
          const delayMs = (delaySecs && Number.isFinite(delaySecs))
            ? delaySecs * 1000
            : BASE_DELAY_MS * 2 ** attempt;
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        if (!response.ok) {
          logPlanExecution("warn", `AI 服务返回非成功状态：${response.status} ${response.statusText}`);
          throw new AppError(`请求外部服务失败：${response.status} ${response.statusText}`, 502);
        }

        const content = await this.readStream(response);
        if (!content) {
          logPlanExecution("warn", "AI 服务返回空内容");
          throw new AppError("AI 服务未返回内容", 502);
        }

        logPlanExecution("info", `AI 服务返回成功，文本长度 ${content.length}`);
        return content;
      } catch (error) {
        lastError = error;
        logPlanExecution("warn", "AI 请求失败", error instanceof Error ? error.message : String(error));
        const normalized = normalizeUpstreamServiceError(error, {
          certificateMessage: "AI 服务证书校验失败，请稍后重试。",
          networkMessage: "AI 服务网络连接失败，请稍后重试。"
        });

        if (normalized instanceof AppError && normalized.status === 504) {
          if (attempt < MAX_RETRIES) {
            logPlanExecution("warn", `AI 请求超时，准备重试（第 ${attempt + 1} 次）`);
            await new Promise(r => setTimeout(r, BASE_DELAY_MS * 2 ** attempt));
            continue;
          }
        }

        throw normalized;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  private async readStream(response: Response): Promise<string> {
    const body = response.body;
    if (!body) {
      throw new AppError("AI 服务返回空响应体", 502);
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = "";
    let insideThink = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const chunk: StreamChunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content ?? "";

            // Skip <think>...</think> blocks from reasoning models
            for (let i = 0; i < delta.length; i++) {
              if (!insideThink && delta.startsWith("<think>", i)) {
                insideThink = true;
                i += 6; // skip past "<think>" (loop will add 1 more)
              } else if (insideThink && delta.startsWith("</think>", i)) {
                insideThink = false;
                i += 7; // skip past "</think>"
              } else if (!insideThink) {
                result += delta[i];
              }
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return result.trim();
  }
}
