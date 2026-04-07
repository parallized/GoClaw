import type { PlanExecutionStreamEvent } from "@goclaw/contracts";
import { describe, expect, it, mock, afterEach } from "bun:test";
import type { AiProvider, WeatherForecast, PointOfInterest } from "../service-types";
import type { ScenarioPlannerContext } from "../scenario-definition";
import { AppError } from "../../lib/errors";
import { runWithPlanExecution } from "../../lib/plan-execution";
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

function makeRunAiProvider(routeNames: string[] = ["世纪公园跑道", "滨江步道", "体育场环形跑道"]): AiProvider {
  return {
    name: "mock-ai",
    generateText: async () => JSON.stringify({
      reason: "AI 结合天气和地点事实整理后的跑步建议。",
      routes: routeNames.map((name, index) => ({
        name,
        why: `${name} 更适合今天第 ${index + 1} 个推荐顺位。`
      })),
      tips: ["AI 建议先热身后出发", "AI 建议根据体感补水"]
    })
  };
}

function makeContext(aiProvider: AiProvider | null = makeRunAiProvider()): ScenarioPlannerContext {
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

async function runWithExecution(
  context: ScenarioPlannerContext,
  input: Parameters<typeof runTomorrowScenario.plan>[1]
) {
  const events: PlanExecutionStreamEvent[] = [];

  const result = await runWithPlanExecution(
    runTomorrowScenario.id,
    runTomorrowScenario.getExecutionStages(context),
    (event) => {
      events.push(event);
    },
    () => runTomorrowScenario.plan(context, input)
  );

  return { result, events };
}

describe("runTomorrowScenario - AI enhancement", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns 503 when AI provider is unavailable", async () => {
    const context = makeContext(null);
    await expect(runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
  });

  it("enhances plan with AI provider", async () => {
    const aiResponse = JSON.stringify({
      reason: "AI按偏好整理后的推荐理由",
      routes: [{ name: "滨江步道", why: "更贴近你想要的临水放松感" }],
      tips: ["AI增强跑步提示1", "AI增强跑步提示2"]
    });

    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async (input) => {
        expect(input.temperature).toBe(0.45);
        expect(input.system).toContain("跑步路线分析师");
        expect(input.system).toContain("poiDescription");
        expect(input.user).toContain('"terrain":["waterfront"]');
        expect(input.user).toContain('"poiDescription"');
        expect(input.user).toContain("滨江步道");
        expect(input.user).toContain('"routes"');
        return aiResponse;
      }
    };

    const context = makeContext(aiProvider);
    const result = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai",
      preferences: {
        terrain: ["waterfront"]
      }
    });

    expect(result.meta.aiEnhanced).toBe(true);
    expect(result.reason).toBe("AI按偏好整理后的推荐理由");
    expect(result.tips).toEqual(["AI增强跑步提示1", "AI增强跑步提示2"]);
    expect(result.routes[0]?.name).toBe("滨江步道");
    expect(result.routes[0]?.why).toContain("更贴近你想要的临水放松感");
  });

  it("uses framed start window to constrain best time and route windows", async () => {
    const context = makeContext();
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

  it("returns 503 when AI emits duplicated route reasons", async () => {
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

    await expect(runTomorrowScenario.plan(makeContext(aiProvider), {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
  });

  it("returns 503 when AI returns invalid JSON", async () => {
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => "completely invalid"
    };

    const context = makeContext(aiProvider);
    await expect(runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
  });

  it("returns 503 when AI throws", async () => {
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => { throw new Error("timeout"); }
    };

    const context = makeContext(aiProvider);
    await expect(runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
  });

  it("returns 503 when AI doesn't cover valid routes", async () => {
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
    await expect(runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
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
      aiProvider: makeRunAiProvider(["江边长线绿道", "城市环形跑道"])
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

  it("does not let terrain tags alter route output when AI selection is fixed", async () => {
    const context = makeContext(makeRunAiProvider(["世纪公园跑道", "滨江步道"]));
    const base = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    const themed = await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai",
      preferences: {
        terrain: ["waterfront"]
      }
    });

    expect(themed.routes.map((route) => route.name)).toEqual(base.routes.map((route) => route.name));
  });

  it("uses a strict search radius derived from the selected running distance", async () => {
    let requestedRadius = 0;

    const context: ScenarioPlannerContext = {
      ...makeContext(makeRunAiProvider(["空谷长滩水公园", "校园操场", "滨水步道"])),
      poiProvider: {
        name: "mock-poi",
        searchRunPois: async (_location, radiusMeters) => {
          requestedRadius = radiusMeters;
          return [
            makeRunPoi("r1", "空谷长滩水公园", { distanceMeters: 2100, terrains: ["park", "waterfront"] }),
            makeRunPoi("r2", "校园操场", { distanceMeters: 1800, terrains: ["track"] }),
            makeRunPoi("r3", "滨水步道", { distanceMeters: 2400, terrains: ["waterfront"] })
          ];
        },
        searchPhotoPois: async () => []
      }
    };

    await runTomorrowScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai",
      preferences: {
        preferredDistanceKm: {
          min: 1,
          max: 5
        }
      }
    });

    expect(requestedRadius).toBe(2500);
  });

  it("emits a structured candidate pool and keeps raw candidates even when usable POIs are below the target minimum", async () => {
    const context: ScenarioPlannerContext = {
      ...makeContext(makeRunAiProvider(["空谷长滩水公园", "校园操场", "社区道路"])),
      poiProvider: {
        name: "mock-poi",
        searchRunPois: async () => [
          makeRunPoi("r1", "空谷长滩水公园", { distanceMeters: 1500, terrains: ["park", "waterfront"] }),
          makeRunPoi("r2", "校园操场", { distanceMeters: 1600, terrains: ["track"] }),
          makeRunPoi("r3", "社区道路", { distanceMeters: 1700, terrains: ["flat"], rawTags: { type: "道路附属设施" } })
        ],
        searchPhotoPois: async () => []
      }
    };

    const { result, events } = await runWithExecution(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    const candidateEvent = events.find((event): event is Extract<PlanExecutionStreamEvent, { type: "data"; dataType: "candidates" }> =>
      event.type === "data" && event.dataType === "candidates"
    );

    expect(candidateEvent).toBeDefined();
    expect(candidateEvent?.payload.rawCandidates).toHaveLength(3);
    expect(candidateEvent?.payload.usableCandidates).toHaveLength(2);
    expect(candidateEvent?.payload.recommendedCandidates?.length).toBeGreaterThanOrEqual(2);
    expect(candidateEvent?.payload.minimumSatisfied).toBe(false);
    expect(candidateEvent?.payload.rawCandidates.some((candidate) => candidate.qualityTier === "raw")).toBe(true);
    expect(result.routes.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 503 when routing service fails for all candidates", async () => {
    const context: ScenarioPlannerContext = {
      ...makeContext(),
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
