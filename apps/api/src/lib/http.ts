import { AppError } from "./errors";

const USER_AGENT = "GoPlan/0.1 (+https://local.dev)";

interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "accept": "application/json",
        "user-agent": USER_AGENT,
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new AppError(`请求外部服务失败：${response.status} ${response.statusText}`, 502);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("请求外部服务超时", 504);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(url: string, options: FetchJsonOptions = {}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "accept": "application/json, text/plain",
        "user-agent": USER_AGENT,
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new AppError(`请求外部服务失败：${response.status} ${response.statusText}`, 502);
    }

    return await response.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("请求外部服务超时", 504);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

