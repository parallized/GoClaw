import type { PlanExecutionStreamEvent } from "@goclaw/contracts";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { OpenMeteoWeatherProvider } from "./open-meteo";
import { runWithPlanExecution, withExecutionStage } from "../../lib/plan-execution";

function createWeatherResponse() {
  return {
    timezone: "Asia/Shanghai",
    hourly: {
      time: ["2026-03-25T08:00"],
      temperature_2m: [20],
      apparent_temperature: [19],
      precipitation_probability: [10],
      uv_index: [3],
      cloud_cover: [25],
      wind_speed_10m: [12]
    },
    daily: {
      time: ["2026-03-25"],
      weather_code: [1],
      temperature_2m_max: [24],
      temperature_2m_min: [16],
      precipitation_probability_max: [15],
      uv_index_max: [5],
      sunrise: ["2026-03-25T06:02"],
      sunset: ["2026-03-25T18:14"]
    }
  };
}

async function captureExecutionLogs(task: () => Promise<unknown>) {
  const events: PlanExecutionStreamEvent[] = [];

  await runWithPlanExecution(
    "photo_week",
    [{ id: "weather", title: "天气评估", order: 0, detail: "天气阶段" }],
    (event) => {
      events.push(event);
    },
    async () => {
      await withExecutionStage("weather", async () => {
        await task();
      });
    }
  );

  return events
    .filter((event): event is Extract<PlanExecutionStreamEvent, { type: "log" }> => event.type === "log")
    .map((event) => event.entry);
}

describe("OpenMeteoWeatherProvider", () => {
  afterEach(() => {
    mock.restore();
  });

  it("requests forecast with the provided coordinates and timezone", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(createWeatherResponse()), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const provider = new OpenMeteoWeatherProvider();
    await provider.getForecast({
      latitude: 30.2138,
      longitude: 120.0205,
      label: "杭州市 · 西湖区"
    }, "Asia/Shanghai", 7);

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const requestUrl = new URL(url);

    expect(requestUrl.searchParams.get("latitude")).toBe("30.2138");
    expect(requestUrl.searchParams.get("longitude")).toBe("120.0205");
    expect(requestUrl.searchParams.get("timezone")).toBe("Asia/Shanghai");
    expect(requestUrl.searchParams.get("forecast_days")).toBe("7");
  });

  it("logs location context on cache hits so timezone is not mistaken for a city", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(createWeatherResponse()), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const provider = new OpenMeteoWeatherProvider();
    const location = {
      latitude: 30.2138,
      longitude: 120.0205,
      label: "杭州市 · 西湖区"
    };

    await captureExecutionLogs(async () => {
      await provider.getForecast(location, "Asia/Shanghai", 7);
      await provider.getForecast(location, "Asia/Shanghai", 7);
    });

    const logs = await captureExecutionLogs(async () => {
      await provider.getForecast(location, "Asia/Shanghai", 7);
    });

    const cacheLog = logs.find((entry) => entry.message === "天气命中缓存");
    expect(cacheLog).toBeDefined();
    expect(cacheLog?.detail).toContain("位置 杭州市 · 西湖区");
    expect(cacheLog?.detail).toContain("坐标 30.2138, 120.0205");
    expect(cacheLog?.detail).toContain("时区 Asia/Shanghai");
    expect(cacheLog?.detail).toContain("7 天");
  });
});
