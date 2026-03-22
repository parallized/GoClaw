import { AppError } from "./errors";

const USER_AGENT = "GoPlan/0.1 (+https://local.dev)";

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AppError && RETRYABLE_STATUS.has(error.status)) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;
  return false;
}

function retryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof AppError && error.retryAfterMs) {
    return error.retryAfterMs;
  }
  return BASE_DELAY_MS * 2 ** attempt;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: FetchJsonOptions,
  accept: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "accept": accept,
        "user-agent": USER_AGENT,
        ...options.headers
      }
    });

    if (!response.ok) {
      const status = RETRYABLE_STATUS.has(response.status) ? response.status : 502;
      const err = new AppError(`请求外部服务失败：${response.status} ${response.statusText}`, status);
      if (response.status === 429) {
        const ra = response.headers.get("retry-after");
        if (ra) {
          const secs = Number(ra);
          err.retryAfterMs = Number.isFinite(secs) ? secs * 1000 : undefined;
        }
      }
      throw err;
    }

    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("请求外部服务超时", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryable(error)) {
        await sleep(retryDelayMs(error, attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const retries = options.retries ?? MAX_RETRIES;
  return withRetry(async () => {
    const response = await fetchWithTimeout(url, options, "application/json");
    return await response.json() as T;
  }, retries);
}

export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const retries = options.retries ?? MAX_RETRIES;
  return withRetry(async () => {
    const response = await fetchWithTimeout(url, options, "application/json, text/plain");
    return await response.text();
  }, retries);
}

