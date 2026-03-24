import { describe, expect, it, mock, afterEach } from "bun:test";
import type { AiProvider, WeatherForecast, PointOfInterest } from "../service-types";
import type { ScenarioPlannerContext } from "../scenario-definition";
import { AppError } from "../../lib/errors";
import { runTomorrowScenario } from "./run-tomorrow";

function makeDailyWeather(date: string) {
  return {
    date,
    weatherCode: 1,
    temperatureMaxC: 22,
    temperatureMinC: 14,
    precipitationProbabilityMax: 10,
    uvIndexMax: 4,
    sunrise: `${date}T06:00`,
    sunset: `${date}T18:30`
  };
}

function makeHourly(date: string, time: string) {
  return {
    time: `${date}T${time}`,
    temperatureC: 18,
    apparentTemperatureC: 17,
    precipitationProbability: 5,
    uvIndex: 3,
    cloudCover: 30,
    windSpeedKmh: 8
  };
}

function makeRunPoi(id: string, name: string): PointOfInterest {
  return {
    id,
    name,
    coordinates: { latitude: 31.23, longitude: 121.47 },
    distanceMeters: 1500,
    category: "run",
    tags: [],
    themes: [],
    terrains: ["track"],
    rawTags: {}
  };
}

function makeForecast(): WeatherForecast {
  // Create forecast with tomorrow's date
  const now = new Date();
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    return makeDailyWeather(d.toISOString().split("T")[0]!);
  });
  const hours = ["05:00", "06:00", "07:00", "08:00", "09:00", "10:00",
                 "11:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
  const hourly = daily.flatMap((d) => hours.map((h) => makeHourly(d.date, h)));
  return { timezone: "Asia/Shanghai", hourly, daily };
}

function makeContext(aiProvider: AiProvider | null = null): ScenarioPlannerContext {
  const forecast = makeForecast();
  const pois = [
    makeRunPoi("r1", "世纪公园跑道"),
    makeRunPoi("r2", "滨江步道"),
    makeRunPoi("r3", "体育场环形跑道")
  ];

  return {
    weatherProvider: {
      name: "mock-weather",
      getForecast: async () => forecast
    },
    geocodingProvider: {
      name: "mock-geo",
      reverseGeocode: async () => ({ city: "上海", displayName: "上海市" })
    },
    poiProvider: {
      name: "mock-poi",
      searchRunPois: async () => pois,
      searchPhotoPois: async () => []
    },
    routingProvider: {
      name: "mock-routing",
      getWalkingRoute: async () => ({ distanceMeters: 2500, durationSeconds: 1800, source: "mock" })
    },
    navigationProvider: {
      name: "mock-nav",
      buildNavigationUrl: (coords, label) => `https://nav.test/${label}`
    },
    aiProvider
  };
}

describe("runTomorrowScenario - AI enhancement", () => {
  afterEach(() => {
    mock.restore();
  });

  it("produces a valid plan without AI provider", async () => {
    const context = makeContext(null);
    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.type).toBe("run_tomorrow");
    expect(result.city).toBe("上海");
    expect(result.routes.length).toBeGreaterThanOrEqual(1);
    expect(result.meta.aiEnhanced).toBe(false);
    expect(result.meta.process.length).toBeGreaterThanOrEqual(1);
    expect(result.meta.process[0]?.title).toBeTruthy();
    expect(result.tips.length).toBeGreaterThanOrEqual(1);
    expect(result.reason).toBeTruthy();
    expect(result.bestTime).toBeTruthy();
  });

  it("enhances plan with AI provider", async () => {
    const aiResponse = JSON.stringify({
      reason: "AI润色的推荐理由",
      routes: [{ name: "世纪公园跑道", why: "AI润色的路线原因" }],
      tips: ["AI增强跑步提示1", "AI增强跑步提示2"]
    });

    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async (input) => {
        expect(input.temperature).toBe(0.35);
        expect(input.system).toContain("跑步规划编辑");
        return aiResponse;
      }
    };

    const context = makeContext(aiProvider);
    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.meta.aiEnhanced).toBe(true);
    expect(result.reason).toBe("AI润色的推荐理由");
    expect(result.tips).toEqual(["AI增强跑步提示1", "AI增强跑步提示2"]);

    const route = result.routes.find((r) => r.name === "世纪公园跑道");
    if (route) {
      expect(route.why).toBe("AI润色的路线原因");
    }
  });

  it("falls back gracefully when AI returns invalid JSON", async () => {
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => "completely invalid"
    };

    const context = makeContext(aiProvider);
    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.type).toBe("run_tomorrow");
    expect(result.routes.length).toBeGreaterThanOrEqual(1);
  });

  it("falls back gracefully when AI throws", async () => {
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => { throw new Error("timeout"); }
    };

    const context = makeContext(aiProvider);
    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.type).toBe("run_tomorrow");
    expect(result.meta.aiEnhanced).toBe(false);
  });

  it("preserves original route data when AI doesn't cover all routes", async () => {
    const aiResponse = JSON.stringify({
      reason: "新理由",
      routes: [{ name: "不存在的路线", why: "不匹配" }],
      tips: ["新提示"]
    });

    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => aiResponse
    };

    const context = makeContext(aiProvider);
    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.meta.aiEnhanced).toBe(true);
    // Routes that AI didn't cover should keep their original `why`
    for (const route of result.routes) {
      expect(route.why).toBeTruthy();
    }
  });

  it("falls back to primary POIs when expanded POI lookup fails", async () => {
    const forecast = makeForecast();
    const primaryPois = [makeRunPoi("r1", "世纪公园跑道")];
    let callCount = 0;

    const context: ScenarioPlannerContext = {
      weatherProvider: {
        name: "mock-weather",
        getForecast: async () => forecast
      },
      geocodingProvider: {
        name: "mock-geo",
        reverseGeocode: async () => ({ city: "上海", displayName: "上海市" })
      },
      poiProvider: {
        name: "mock-poi",
        searchRunPois: async () => {
          callCount += 1;
          if (callCount === 1) {
            return primaryPois;
          }

          throw new AppError("请求外部服务失败：429 Too Many Requests", 429);
        },
        searchPhotoPois: async () => []
      },
      routingProvider: {
        name: "mock-routing",
        getWalkingRoute: async () => ({ distanceMeters: 2500, durationSeconds: 1800, source: "mock" })
      },
      navigationProvider: {
        name: "mock-nav",
        buildNavigationUrl: (coords, label) => `https://nav.test/${label}`
      },
      aiProvider: null
    };

    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(callCount).toBe(2);
    expect(result.routes.length).toBe(1);
    expect(result.routes[0]?.name).toBe("世纪公园跑道");
  });

  it("returns 503 when routing service fails for all candidates", async () => {
    const context: ScenarioPlannerContext = {
      ...makeContext(null),
      routingProvider: {
        name: "mock-routing",
        getWalkingRoute: async () => {
          throw new AppError("请求外部服务失败：429 Too Many Requests", 429);
        }
      }
    };

    await expect(runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503,
      message: "路径服务当前较繁忙，请稍后重试。"
    });
  });
});
