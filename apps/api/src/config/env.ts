const DEFAULTS = {
  apiPort: 6174,
  corsOrigin: "http://localhost:6173",
  aiBaseUrl: "https://ai.huan666.de/v1",
  aiModel: "grok-4.20-beta",
  aiTimeoutMs: 25_000
} as const;

function toNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const env = {
  apiPort: toNumber(process.env.API_PORT, DEFAULTS.apiPort),
  corsOrigin: process.env.CORS_ORIGIN ?? DEFAULTS.corsOrigin,
  aiBaseUrl: process.env.AI_BASE_URL ?? DEFAULTS.aiBaseUrl,
  aiApiKey: process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL ?? DEFAULTS.aiModel,
  aiTimeoutMs: toNumber(process.env.AI_TIMEOUT_MS, DEFAULTS.aiTimeoutMs)
};

export function isAiEnabled(): boolean {
  return Boolean(env.aiApiKey && env.aiBaseUrl && env.aiModel);
}
