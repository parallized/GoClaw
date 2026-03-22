import { buildAiApiUrl } from "../apps/api/src/infrastructure/ai/api-url";

const apiKey = Bun.env.AI_API_KEY;
const baseUrl = Bun.env.AI_BASE_URL ?? "https://ai.huan666.de/v1";
const model = Bun.env.AI_MODEL ?? "grok-4.20-beta";

if (!apiKey) {
  console.error("缺少 AI_API_KEY，无法执行 AI v1 接口验证。");
  process.exit(1);
}

const modelsUrl = buildAiApiUrl(baseUrl, "/models");
const modelsResponse = await fetch(modelsUrl, {
  headers: {
    authorization: `Bearer ${apiKey}`
  }
});

if (!modelsResponse.ok) {
  console.error(`AI 模型列表请求失败：${modelsResponse.status} ${modelsResponse.statusText}`);
  process.exit(1);
}

const modelsPayload = await modelsResponse.json() as { data?: Array<{ id?: string }> };
const hasModel = modelsPayload.data?.some((item) => item.id === model) ?? false;

const completionUrl = buildAiApiUrl(baseUrl, "/chat/completions");
const completionResponse = await fetch(completionUrl, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json"
  },
  body: JSON.stringify({
    model,
    temperature: 0,
    stream: false,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "你是接口连通性测试助手。请只输出 JSON，字段为 ok 和 model。"
      },
      {
        role: "user",
        content: "请返回连通性测试结果。"
      }
    ]
  })
});

if (!completionResponse.ok) {
  console.error(`AI 对话补全请求失败：${completionResponse.status} ${completionResponse.statusText}`);
  process.exit(1);
}

const completionPayload = await completionResponse.json() as {
  choices?: Array<{ message?: { content?: string } }>;
};

const responseText = completionPayload.choices?.[0]?.message?.content?.trim() ?? "";

console.log(JSON.stringify({
  ok: true,
  baseUrl: buildAiApiUrl(baseUrl, ""),
  modelsUrl,
  completionUrl,
  model,
  modelListed: hasModel,
  response: responseText
}, null, 2));
