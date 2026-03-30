import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, normalizeUpstreamServiceError } from "./errors";
import { logPlanExecution } from "./plan-execution";

const USER_AGENT = "GoClaw/0.1 (+https://local.dev)";
const IS_DEV = process.env.NODE_ENV !== "production";
const __filename = fileURLToPath(import.meta.url);
const LOGS_DIR = join(dirname(__filename), "..", "logs");

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key"
]);
const SENSITIVE_FIELD_PATTERN = /(authorization|token|secret|password|cookie|api[-_]?key|signature)/i;

interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

interface ApiCallLogContext {
  url: string;
  method: string;
  accept: string;
  timeoutMs: number;
  headers: Headers;
  body: RequestInit["body"];
  attempt: number;
  startedAt: number;
  response?: Response;
  responseText?: string;
  error?: unknown;
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

function getHostLabel(url: string): string {
  try {
    return new URL(url).host || "external";
  } catch {
    return "external";
  }
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "request";
}

function sanitizeUrl(url: string): string {
  try {
    const target = new URL(url);

    for (const key of Array.from(target.searchParams.keys())) {
      if (SENSITIVE_FIELD_PATTERN.test(key)) {
        target.searchParams.set(key, "***");
      }
    }

    if (target.username) {
      target.username = "***";
    }

    if (target.password) {
      target.password = "***";
    }

    return target.toString();
  } catch {
    return url;
  }
}

function stringifyForLog(value: unknown): string {
  return JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }

    return currentValue;
  }, 2);
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      SENSITIVE_FIELD_PATTERN.test(key) ? "***" : sanitizeValue(entryValue)
    ])
  );
}

function appendMultiValueEntry(target: Record<string, string | string[]>, key: string, value: string) {
  const currentValue = target[key];
  if (currentValue === undefined) {
    target[key] = value;
    return;
  }

  if (Array.isArray(currentValue)) {
    currentValue.push(value);
    return;
  }

  target[key] = [currentValue, value];
}

function paramsToObject(params: URLSearchParams): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of params.entries()) {
    appendMultiValueEntry(result, key, value);
  }
  return result;
}

function formDataToObject(formData: FormData): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  formData.forEach((value, key) => {
    appendMultiValueEntry(
      result,
      key,
      typeof value === "string"
        ? value
        : `[Blob size=${value.size} type=${value.type || "application/octet-stream"}]`
    );
  });
  return result;
}

function serializeRequestBody(body: RequestInit["body"]): unknown {
  if (body == null) {
    return null;
  }

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return sanitizeValue(JSON.parse(body));
      } catch {
        return body;
      }
    }

    return body;
  }

  if (body instanceof URLSearchParams) {
    return sanitizeValue(paramsToObject(body));
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return sanitizeValue(formDataToObject(body));
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return `[Blob size=${body.size} type=${body.type || "application/octet-stream"}]`;
  }

  if (body instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${body.byteLength}]`;
  }

  if (ArrayBuffer.isView(body)) {
    return `[${body.constructor.name} byteLength=${body.byteLength}]`;
  }

  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return "[ReadableStream]";
  }

  return `[${Object.prototype.toString.call(body)}]`;
}

function sanitizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, name) => {
    result[name] = SENSITIVE_HEADER_NAMES.has(name.toLowerCase()) || SENSITIVE_FIELD_PATTERN.test(name)
      ? "***"
      : value;
  });
  return result;
}

function parseLoggedResponse(text: string, contentType?: string | null): { fileName: string; content: string } {
  const normalizedContentType = contentType?.toLowerCase() ?? "";
  const trimmed = text.trim();
  const mayBeJson = Boolean(trimmed)
    && (normalizedContentType.includes("application/json")
      || normalizedContentType.includes("+json")
      || trimmed.startsWith("{")
      || trimmed.startsWith("["));

  if (mayBeJson) {
    try {
      return {
        fileName: "output.json",
        content: stringifyForLog(sanitizeValue(JSON.parse(text)))
      };
    } catch {
      // fall back to plain text
    }
  }

  return {
    fileName: "output.txt",
    content: text
  };
}

function normalizeLoggedError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: String(error)
  };
}

function buildLogDirName(url: string, method: string, attempt: number): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomSuffix = Math.random().toString(36).slice(2, 8);

  return [
    timestamp,
    sanitizePathSegment(getHostLabel(url)),
    sanitizePathSegment(method),
    `attempt-${attempt + 1}`,
    randomSuffix
  ].join("-");
}

async function readResponseText(response: Response): Promise<string | undefined> {
  try {
    return await response.clone().text();
  } catch {
    return undefined;
  }
}

async function writeApiCallLog(context: ApiCallLogContext): Promise<void> {
  if (!IS_DEV) {
    return;
  }

  try {
    const logDir = join(LOGS_DIR, buildLogDirName(context.url, context.method, context.attempt));
    await mkdir(logDir, { recursive: true });

    await writeFile(join(logDir, "input.json"), stringifyForLog({
      url: sanitizeUrl(context.url),
      host: getHostLabel(context.url),
      method: context.method,
      accept: context.accept,
      timeoutMs: context.timeoutMs,
      attempt: context.attempt + 1,
      headers: sanitizeHeaders(context.headers),
      body: serializeRequestBody(context.body)
    }), "utf-8");

    await writeFile(join(logDir, "meta.json"), stringifyForLog({
      url: sanitizeUrl(context.url),
      method: context.method,
      attempt: context.attempt + 1,
      durationMs: Date.now() - context.startedAt,
      ok: context.response?.ok,
      status: context.response?.status,
      statusText: context.response?.statusText,
      responseHeaders: context.response ? sanitizeHeaders(context.response.headers) : undefined
    }), "utf-8");

    if (context.responseText !== undefined) {
      const output = parseLoggedResponse(
        context.responseText,
        context.response?.headers.get("content-type")
      );
      await writeFile(join(logDir, output.fileName), output.content, "utf-8");
    }

    if (context.error !== undefined) {
      await writeFile(join(logDir, "error.json"), stringifyForLog(normalizeLoggedError(context.error)), "utf-8");
    }
  } catch {
    // logging is best-effort, never block the main flow
  }
}

async function fetchWithTimeout(
  url: string,
  options: FetchJsonOptions,
  accept: string,
  attempt: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const method = (options.method ?? "GET").toUpperCase();
  const startedAt = Date.now();
  const headers = new Headers(options.headers);
  headers.set("accept", accept);
  headers.set("user-agent", USER_AGENT);
  const targetUrl = sanitizeUrl(url);
  const targetHost = getHostLabel(url);
  let responseLogged = false;

  try {
    logPlanExecution("info", `请求外部服务：${targetHost}`, `${method} ${targetUrl}`);
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers
    });

    const responseText = await readResponseText(response);
    await writeApiCallLog({
      url,
      method,
      accept,
      timeoutMs,
      headers,
      body: options.body,
      attempt,
      startedAt,
      response,
      responseText
    });
    responseLogged = true;

    if (!response.ok) {
      logPlanExecution("warn", `外部服务返回非成功状态：${response.status} ${response.statusText}`, targetUrl);
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

    logPlanExecution("info", `外部服务响应成功：${response.status}`, targetUrl);
    return response;
  } catch (error) {
    if (!responseLogged) {
      await writeApiCallLog({
        url,
        method,
        accept,
        timeoutMs,
        headers,
        body: options.body,
        attempt,
        startedAt,
        error
      });
    }

    logPlanExecution("warn", "外部服务请求失败", error instanceof Error ? error.message : String(error));
    const normalized = normalizeUpstreamServiceError(error);
    if (normalized instanceof AppError) {
      throw normalized;
    }
    throw normalized;
  } finally {
    clearTimeout(timeout);
  }
}

async function withRetry<T>(fn: (attempt: number) => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        logPlanExecution("info", `开始第 ${attempt + 1} 次重试`);
      }
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < retries && isRetryable(error)) {
        logPlanExecution("warn", `请求可重试，等待后重试（${attempt + 1}/${retries + 1}）`);
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
  return withRetry(async (attempt) => {
    const response = await fetchWithTimeout(url, options, "application/json", attempt);
    return await response.json() as T;
  }, retries);
}

export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const retries = options.retries ?? MAX_RETRIES;
  return withRetry(async (attempt) => {
    const response = await fetchWithTimeout(url, options, "application/json, text/plain", attempt);
    return await response.text();
  }, retries);
}

