const apiKey = Bun.env.AI_API_KEY;
const baseUrl = Bun.env.AI_BASE_URL ?? "https://ai.huan666.de/v1";
const model = Bun.env.AI_MODEL ?? "grok-4.20-beta";

if (!apiKey) {
  console.error("缺少 AI_API_KEY，无法执行 AI 接口验证。");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/chat/completions`, {
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

if (!response.ok) {
  console.error(`AI 接口请求失败：${response.status} ${response.statusText}`);
  process.exit(1);
}

const json = await response.json();
console.log(JSON.stringify({
  model,
  ok: true,
  response: json.choices?.[0]?.message?.content ?? null
}, null, 2));
