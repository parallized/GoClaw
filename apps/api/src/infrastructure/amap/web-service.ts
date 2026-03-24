import { AppError } from "../../lib/errors";
import { fetchJson } from "../../lib/http";

const DEFAULT_BASE_URL = "https://restapi.amap.com";

interface AmapCommonResponse {
  status?: string;
  info?: string;
  infocode?: string;
}

export interface AmapWebServiceConfig {
  baseUrl?: string;
  key: string;
  retries?: number;
  timeoutMs?: number;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildSearchParams(params: Record<string, string | number | undefined>, key: string): URLSearchParams {
  const searchParams = new URLSearchParams({
    key,
    output: "JSON"
  });

  for (const [paramKey, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    searchParams.set(paramKey, String(value));
  }

  return searchParams;
}

function isRateLimited(text: string): boolean {
  const normalized = text.toLowerCase();
  return ["limit", "quota", "count", "frequent", "qps", "daily"].some((keyword) => normalized.includes(keyword));
}

function isInvalidKey(text: string): boolean {
  const normalized = text.toLowerCase();
  return ["invalid", "userkey", "key", "sig", "signature", "permission", "权限", "签名"].some((keyword) => normalized.includes(keyword));
}

function toAmapApiError(response: AmapCommonResponse): AppError {
  const infoText = [response.info, response.infocode].filter(Boolean).join(" ");

  if (isRateLimited(infoText)) {
    return new AppError("地点服务当前较繁忙，请稍后重试。", 429);
  }

  if (isInvalidKey(infoText)) {
    return new AppError("高德地点服务 Key 无效或权限未开通，请检查 AMAP_WEB_SERVICE_KEY 配置。", 503);
  }

  return new AppError("地点服务暂时不可用，请稍后重试。", 503);
}

export function normalizeAmapError(error: unknown): AppError {
  if (error instanceof AppError) {
    if (/AMAP_WEB_SERVICE_KEY|高德地点服务 Key 无效|权限未开通/.test(error.message)) {
      return error;
    }

    if (error.status === 429) {
      return new AppError("地点服务当前较繁忙，请稍后重试。", 429);
    }

    if (error.status >= 500) {
      return new AppError("地点服务暂时不可用，请稍后重试。", 503);
    }

    return error;
  }

  return new AppError("地点服务暂时不可用，请稍后重试。", 503);
}

export function shouldFallbackFromPrimary(error: unknown): boolean {
  if (error instanceof AppError) {
    if (/AMAP_WEB_SERVICE_KEY|高德地点服务 Key 无效|权限未开通/.test(error.message)) {
      return false;
    }

    return error.status === 429 || error.status >= 500;
  }

  return true;
}

export async function requestAmapJson<T extends AmapCommonResponse>(
  config: AmapWebServiceConfig,
  path: string,
  params: Record<string, string | number | undefined>
): Promise<T> {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
  const query = buildSearchParams(params, config.key);
  const url = `${baseUrl}${path}?${query.toString()}`;

  const response = await fetchJson<T>(url, {
    timeoutMs: config.timeoutMs ?? 12_000,
    retries: config.retries ?? 1
  });

  if (response.status && response.status !== "1") {
    throw toAmapApiError(response);
  }

  return response;
}
