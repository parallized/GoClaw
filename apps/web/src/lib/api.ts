import { type LocationLabel, type PlanResult, type ScenarioId, type ScenarioManifest } from "@goplan/contracts";

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
