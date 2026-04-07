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

function makeRunPoi(id: string, name: string, overrides: Partial<PointOfInterest> = {}): PointOfInterest {
  const base: PointOfInterest = {
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

  return {
    ...base,
    ...overrides,
    coordinates: overrides.coordinates ?? base.coordinates,
    tags: overrides.tags ?? base.tags,
    themes: overrides.themes ?? base.themes,
    terrains: overrides.terrains ?? base.terrains,
    rawTags: overrides.rawTags ?? base.rawTags
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
    expect(result.framedWindow).toEqual({ from: "05:00", to: "21:00" });
    expect(result.routes[0]?.recommendedTime).toBeTruthy();
    expect(result.routes[0]?.timeWindow.from).toBeTruthy();
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
        expect(input.user).toContain("recommendedTime");
        expect(input.user).toContain("timeWindow");
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

  it("uses framed start window to constrain best time and route windows", async () => {
    const context = makeContext(null);
    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai",
      preferences: {
        startWindow: {
          from: "08:00",
          to: "10:00"
        }
      }
    });

    expect(result.framedWindow).toEqual({ from: "08:00", to: "10:00" });
    expect(result.bestTime >= "08:00" && result.bestTime <= "10:00").toBe(true);
    expect(result.routes.every((route) => route.recommendedTime >= "08:00" && route.recommendedTime <= "10:00")).toBe(true);
    expect(result.routes.every((route) => route.timeWindow.from >= "08:00" && route.timeWindow.to <= "10:00")).toBe(true);
  });

  it("falls back when AI emits duplicated route reasons", async () => {
    const aiResponse = JSON.stringify({
      reason: "统一的推荐理由",
      routes: [
        { name: "世纪公园跑道", why: "统一的推荐理由" },
        { name: "滨江步道", why: "统一的推荐理由" }
      ],
      tips: ["补水", "补水", "注意恢复"]
    });

    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => aiResponse
    };

    const result = await runTomorrowScenario.plan(makeContext(aiProvider), {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(new Set(result.routes.map((route) => route.why)).size).toBe(result.routes.length);
    expect(result.tips).toEqual(["补水", "注意恢复"]);
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

  it("prioritizes mileage-fit POIs before routing instead of only taking the nearest results", async () => {
    const forecast = makeForecast();
    const nearbyPois = Array.from({ length: 10 }, (_, index) => makeRunPoi(`n${index + 1}`, `附近口袋公园${index + 1}`, {
      coordinates: { latitude: 31.23 + index * 0.001, longitude: 121.47 + index * 0.001 },
      distanceMeters: 300 + index * 120,
      terrains: ["park"]
    }));
    const preferredPois = [
      makeRunPoi("fit-1", "江边长线绿道", {
        coordinates: { latitude: 31.28, longitude: 121.58 },
        distanceMeters: 3600,
        terrains: ["waterfront", "park"]
      }),
      makeRunPoi("fit-2", "城市环形跑道", {
        coordinates: { latitude: 31.29, longitude: 121.59 },
        distanceMeters: 4300,
        terrains: ["track", "park"]
      })
    ];
    const walkingDistanceByLongitude = new Map<number, number>([
      [121.58, 4300],
      [121.59, 4800]
    ]);

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
        searchRunPois: async () => [...nearbyPois, ...preferredPois],
        searchPhotoPois: async () => []
      },
      routingProvider: {
        name: "mock-routing",
        getWalkingRoute: async (_from, to) => ({
          distanceMeters: walkingDistanceByLongitude.get(to.longitude) ?? 900,
          durationSeconds: 1800,
          source: "mock"
        })
      },
      navigationProvider: {
        name: "mock-nav",
        buildNavigationUrl: (coords, label) => `https://nav.test/${label}`
      },
      aiProvider: null
    };

    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai",
      preferences: {
        preferredDistanceKm: {
          min: 8,
          max: 10
        }
      }
    });

    const routeNames = result.routes.map((route) => route.name);
    expect(routeNames).toContain("江边长线绿道");
    expect(routeNames).toContain("城市环形跑道");
    expect(result.routes.every((route) => route.distanceKm >= 8)).toBe(true);
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
