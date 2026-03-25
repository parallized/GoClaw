import {
  planExecutionStreamEventSchema,
  type LocationLabel,
  type PlanExecutionStreamEvent,
  type PlanResult,
  type ScenarioId,
  type ScenarioManifest
} from "@goplan/contracts";

interface ApiErrorShape {
  ok: false;
  error: {
    message: string;
    issues?: unknown;
  };
}

interface ApiSuccessShape<T> {
  ok: true;
  data: T;
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const json = await response.json() as ApiSuccessShape<T> | ApiErrorShape;
  if (!response.ok || !json.ok) {
    throw new Error(json.ok ? `请求失败：${response.status}` : json.error.message);
  }

  return json.data;
}

export function fetchScenarios(): Promise<ScenarioManifest[]> {
  return request<ScenarioManifest[]>("/api/scenarios");
}

export function fetchLocationLabel(latitude: number, longitude: number): Promise<LocationLabel> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude)
  });
  return request<LocationLabel>(`/api/location-label?${params.toString()}`);
}

export function fetchPlan<TInput>(scenarioId: ScenarioId, payload: TInput): Promise<PlanResult> {
  return request<PlanResult>(`/api/plans/${scenarioId}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function streamPlan<TInput>(
  scenarioId: ScenarioId,
  payload: TInput,
  handlers: {
    onEvent: (event: PlanExecutionStreamEvent) => void;
    signal?: AbortSignal;
  }
): Promise<void> {
  const response = await fetch(`/api/plans/${scenarioId}/stream`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: handlers.signal
  });

  if (!response.ok) {
    const json = await response.json() as ApiSuccessShape<PlanResult> | ApiErrorShape;
    throw new Error(json.ok ? `请求失败：${response.status}` : json.error.message);
  }

  if (!response.body) {
    throw new Error("服务端未返回可读取的流式响应");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const line = chunk
          .split("\n")
          .map((item) => item.trim())
          .find((item) => item.startsWith("data: "));

        if (!line) {
          continue;
        }

        const raw = line.slice(6);
        const parsed = planExecutionStreamEventSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          handlers.onEvent(parsed.data);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
