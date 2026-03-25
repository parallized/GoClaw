import type { PlanExecutionStreamEvent } from "@goclaw/contracts";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { runWithPlanExecution, withExecutionStage } from "../../lib/plan-execution";

/** Build a SSE stream body from an array of content strings. */
function buildSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = chunks
    .map((content) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: null }] })}\n\n`
    )
    .join("")
    + "data: [DONE]\n\n";

  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    }
  });
}

function mockFetchOk(chunks: string[]) {
  return spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(buildSSEStream(chunks), { status: 200 })
  );
}

async function captureExecutionLogs(task: () => Promise<unknown>) {
  const events: PlanExecutionStreamEvent[] = [];

  await runWithPlanExecution(
    "run_tomorrow",
    [{ id: "ai", title: "AI", order: 0, detail: "AI stage" }],
    (event) => {
      events.push(event);
    },
    async () => {
      await withExecutionStage("ai", async () => {
        await task();
      });
    }
  );

  return events
    .filter((event): event is Extract<PlanExecutionStreamEvent, { type: "log" }> => event.type === "log")
    .map((event) => event.entry);
}

describe("OpenAiCompatibleProvider", () => {
  let originalApiKey: string | undefined;
  let originalBaseUrl: string;

  beforeEach(() => {
    originalApiKey = env.aiApiKey;
    originalBaseUrl = env.aiBaseUrl;
    (env as Record<string, unknown>).aiApiKey = "test-key";
    (env as Record<string, unknown>).aiBaseUrl = "https://ai.huan666.de/v1";
  });

  afterEach(() => {
    (env as Record<string, unknown>).aiApiKey = originalApiKey;
    (env as Record<string, unknown>).aiBaseUrl = originalBaseUrl;
    mock.restore();
  });

  it("has correct name", () => {
    const provider = new OpenAiCompatibleProvider();
    expect(provider.name).toBe("openai-compatible");
  });

  it("throws when AI_API_KEY is not configured", async () => {
    (env as Record<string, unknown>).aiApiKey = undefined;
    const provider = new OpenAiCompatibleProvider();

    await expect(
      provider.generateText({ system: "sys", user: "usr" })
    ).rejects.toThrow("未配置 AI_API_KEY");
  });

  it("generates text from streaming response", async () => {
    const fetchSpy = mockFetchOk(["Hello", " World"]);
    const provider = new OpenAiCompatibleProvider();

    const result = await provider.generateText({ system: "sys", user: "usr" });
    expect(result).toBe("Hello World");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sends correct request body with default temperature", async () => {
    const fetchSpy = mockFetchOk(["ok"]);
    const provider = new OpenAiCompatibleProvider();

    await provider.generateText({ system: "system prompt", user: "user prompt" });

    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/chat/completions");
    expect(url).toBe("https://ai.huan666.de/v1/chat/completions");
    const body = JSON.parse(options.body as string);
    expect(body.temperature).toBe(0.3);
    expect(body.stream).toBe(true);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "user prompt" }
    ]);
  });

  it("normalizes base url when env contains endpoint path", async () => {
    (env as Record<string, unknown>).aiBaseUrl = "https://ai.huan666.de/v1/models";
    const fetchSpy = mockFetchOk(["ok"]);
    const provider = new OpenAiCompatibleProvider();

    await provider.generateText({ system: "system prompt", user: "user prompt" });

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai.huan666.de/v1/chat/completions");
  });

  it("passes custom temperature", async () => {
    const fetchSpy = mockFetchOk(["ok"]);
    const provider = new OpenAiCompatibleProvider();

    await provider.generateText({ system: "s", user: "u", temperature: 0.7 });

    const body = JSON.parse((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.temperature).toBe(0.7);
  });

  it("logs redacted request preview inside plan execution", async () => {
    mockFetchOk(["ok"]);
    const provider = new OpenAiCompatibleProvider();

    const logs = await captureExecutionLogs(async () => {
      await provider.generateText({
        system: "Authorization Bearer abcdefghijklmnopqrstuvwxyz",
        user: "联系 13800138000 或 foo@example.com，token sk-secret-1234567890"
      });
    });

    const previewLog = logs.find((entry) => entry.message === "AI 请求载荷（已脱敏）");
    expect(previewLog).toBeDefined();
    expect(previewLog?.detail).toContain("Bearer ***");
    expect(previewLog?.detail).toContain("[phone]");
    expect(previewLog?.detail).toContain("[email]");
    expect(previewLog?.detail).toContain("sk-***");
  });

  it("logs streaming progress inside plan execution", async () => {
    mockFetchOk(["Hello", " World"]);
    const provider = new OpenAiCompatibleProvider();

    const logs = await captureExecutionLogs(async () => {
      await provider.generateText({ system: "sys", user: "usr" });
    });

    const progressLog = logs.find((entry) => entry.message === "AI 流式输出接收中");
    const finalLog = logs.find((entry) => entry.message === "AI 流式响应结束");
    expect(progressLog).toBeDefined();
    expect(finalLog).toBeDefined();

    const progressDetail = JSON.parse(progressLog?.detail ?? "{}") as Record<string, unknown>;
    const finalDetail = JSON.parse(finalLog?.detail ?? "{}") as Record<string, unknown>;
    expect(progressDetail.phase).toBe("partial");
    expect(Number(progressDetail.visibleChars)).toBeGreaterThan(0);
    expect(Number(progressDetail.estimatedCompletionTokens)).toBeGreaterThan(0);
    expect(finalDetail.phase).toBe("final");
    expect(Number(finalDetail.visibleChars)).toBe(11);
  });

  it("filters out <think> blocks from reasoning models", async () => {
    mockFetchOk(["<think>reasoning here</think>", '{"result":"clean"}']);
    const provider = new OpenAiCompatibleProvider();

    const result = await provider.generateText({ system: "s", user: "u" });
    expect(result).toBe('{"result":"clean"}');
  });

  it("filters think blocks within a single chunk", async () => {
    mockFetchOk(["<think>some reasoning</think>actual content"]);
    const provider = new OpenAiCompatibleProvider();

    const result = await provider.generateText({ system: "s", user: "u" });
    expect(result).toBe("actual content");
  });

  it("throws when all content is inside think blocks", async () => {
    mockFetchOk(["<think>only reasoning</think>"]);
    const provider = new OpenAiCompatibleProvider();

    try {
      await provider.generateText({ system: "s", user: "u" });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(502);
    }
  });

  it("throws AppError with 502 on non-ok response", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })
    );
    const provider = new OpenAiCompatibleProvider();

    try {
      await provider.generateText({ system: "s", user: "u" });
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(502);
      expect((error as AppError).message).toContain("500");
    }
  });

  it("throws AppError with 502 when response body is null", async () => {
    const response = new Response(null, { status: 200 });
    // Override body to be null
    Object.defineProperty(response, "body", { value: null });
    spyOn(globalThis, "fetch").mockResolvedValue(response);
    const provider = new OpenAiCompatibleProvider();

    try {
      await provider.generateText({ system: "s", user: "u" });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(502);
      expect((error as AppError).message).toContain("空响应体");
    }
  });

  it("maps certificate verification failures to a user-friendly 503 error", async () => {
    const certError = new Error("unknown certificate verification error") as Error & { code?: string };
    certError.code = "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
    spyOn(globalThis, "fetch").mockRejectedValue(certError);
    const provider = new OpenAiCompatibleProvider();

    await expect(provider.generateText({ system: "s", user: "u" })).rejects.toMatchObject({
      status: 503,
      message: "AI 服务证书校验失败，请稍后重试。"
    });
  });

  it("throws AppError with 502 when stream returns no content", async () => {
    // SSE stream with only [DONE] and no content
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));
    const provider = new OpenAiCompatibleProvider();

    try {
      await provider.generateText({ system: "s", user: "u" });
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).status).toBe(502);
      expect((error as AppError).message).toContain("未返回内容");
    }
  });

  it("skips malformed JSON chunks gracefully", async () => {
    const encoder = new TextEncoder();
    const lines = [
      "data: not-json\n\n",
      `data: ${JSON.stringify({ choices: [{ delta: { content: "valid" }, finish_reason: null }] })}\n\n`,
      "data: [DONE]\n\n"
    ].join("");

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines));
        controller.close();
      }
    });

    spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));
    const provider = new OpenAiCompatibleProvider();

    const result = await provider.generateText({ system: "s", user: "u" });
    expect(result).toBe("valid");
  });

  it("handles multi-chunk SSE stream delivered in small pieces", async () => {
    const encoder = new TextEncoder();
    const chunk1 = `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`;
    const chunk2 = `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\ndata: [DONE]\n\n`;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(chunk1));
        controller.enqueue(encoder.encode(chunk2));
        controller.close();
      }
    });

    spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));
    const provider = new OpenAiCompatibleProvider();

    const result = await provider.generateText({ system: "s", user: "u" });
    expect(result).toBe("Hello");
  });

  it("skips SSE lines that are not data lines", async () => {
    const encoder = new TextEncoder();
    const lines = [
      ": comment line\n\n",
      "event: message\n",
      `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`,
      "data: [DONE]\n\n"
    ].join("");

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines));
        controller.close();
      }
    });

    spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream, { status: 200 }));
    const provider = new OpenAiCompatibleProvider();

    const result = await provider.generateText({ system: "s", user: "u" });
    expect(result).toBe("ok");
  });
});
