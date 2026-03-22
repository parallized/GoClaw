import type { AiProvider } from "../../domain/service-types";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { fetchJson } from "../../lib/http";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type: string; text?: string }>;
    };
  }>;
}

function normalizeContent(content: string | Array<{ type: string; text?: string }> | undefined): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => item.text ?? "").join("\n").trim();
  }

  return "";
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai-compatible";

  async generateText(input: { system: string; user: string; temperature?: number }): Promise<string> {
    if (!env.aiApiKey) {
      throw new AppError("未配置 AI_API_KEY", 500);
    }

    const response = await fetchJson<ChatCompletionResponse>(`${env.aiBaseUrl}/chat/completions`, {
      method: "POST",
      timeoutMs: env.aiTimeoutMs,
      headers: {
        authorization: `Bearer ${env.aiApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: env.aiModel,
        temperature: input.temperature ?? 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user }
        ]
      })
    });

    const content = normalizeContent(response.choices?.[0]?.message?.content);
    if (!content) {
      throw new AppError("AI 服务未返回内容", 502);
    }

    return content;
  }
}
