import { describe, expect, it, mock, afterEach, spyOn } from "bun:test";
import type { AiProvider, WeatherForecast, PointOfInterest, RoutePlan } from "../service-types";
import type { ScenarioPlannerContext } from "../scenario-definition";
import { AppError } from "../../lib/errors";
import { photoWeekScenario } from "./photo-week";

function makeDailyWeather(date: string, overrides?: Partial<import("../service-types").DailyWeatherPoint>) {
  return {
    date,
    weatherCode: 1,
    temperatureMaxC: 25,
    temperatureMinC: 15,
    precipitationProbabilityMax: 10,
    uvIndexMax: 4,
    sunrise: `${date}T06:00`,
    sunset: `${date}T18:30`,
    ...overrides
  };
}

function makeHourly(date: string) {
  return {
    time: `${date}T07:00`,
    temperatureC: 20,
    apparentTemperatureC: 19,
    precipitationProbability: 5,
    uvIndex: 3,
    cloudCover: 30,
    windSpeedKmh: 8
  };
}

function makePoi(id: string, name: string): PointOfInterest {
  return {
    id,
    name,
    coordinates: { latitude: 31.23, longitude: 121.47 },
    distanceMeters: 2000,
    category: "photo",
    tags: [],
    themes: ["architecture"],
    terrains: [],
    rawTags: {}
  };
}

function makeForecast(startDate: string): WeatherForecast {
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().split("T")[0]!;
    return makeDailyWeather(date);
  });
  const hourly = daily.map((d) => makeHourly(d.date));
  return { timezone: "Asia/Shanghai", hourly, daily };
}

function makeContext(aiProvider: AiProvider | null = null): ScenarioPlannerContext {
  const forecast = makeForecast("2026-03-22");
  const pois = [
    makePoi("p1", "外滩"),
    makePoi("p2", "豫园"),
    makePoi("p3", "南京路步行街"),
    makePoi("p4", "人民广场"),
    makePoi("p5", "新天地"),
    makePoi("p6", "田子坊")
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
      searchRunPois: async () => [],
      searchPhotoPois: async () => pois
    },
    routingProvider: {
      name: "mock-routing",
      getWalkingRoute: async () => ({ distanceMeters: 3000, durationSeconds: 2400, source: "mock" })
    },
    navigationProvider: {
      name: "mock-nav",
      buildNavigationUrl: (coords, label) => `https://nav.test/${label}`
    },
    aiProvider
  };
}

describe("photoWeekScenario - AI enhancement", () => {
  afterEach(() => {
    mock.restore();
  });

  it("produces a valid plan without AI provider", async () => {
    const context = makeContext(null);
    const result = await photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.type).toBe("photo_week");
    expect(result.city).toBe("上海");
    expect(result.days.length).toBe(7);
    expect(result.meta.aiEnhanced).toBe(false);
    expect(result.meta.process.length).toBeGreaterThanOrEqual(1);
    expect(result.meta.process[0]?.title).toBeTruthy();
    expect(result.tips.length).toBeGreaterThanOrEqual(1);
  });

  it("enhances plan with AI provider", async () => {
    const aiResponse = JSON.stringify({
      tips: ["AI增强提示1", "AI增强提示2"],
      days: [{
        date: "2026-03-22",
        spots: [{
          name: "外滩",
          reason: "AI润色的拍摄理由",
          way: "AI润色的拍摄方式",
          cameraSummary: "AI润色的参数建议",
          tip: "AI润色的小贴士"
        }]
      }]
    });

    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async (input) => {
        expect(input.system).toContain("description");
        expect(input.user).toContain('"description"');
        expect(input.user).toContain("外滩");
        return aiResponse;
      }
    };

    const context = makeContext(aiProvider);
    const result = await photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.meta.aiEnhanced).toBe(true);
    expect(result.tips).toEqual(["AI增强提示1", "AI增强提示2"]);

    const firstDay = result.days.find((d) => d.date === "2026-03-22");
    const bund = firstDay?.spots.find((s) => s.name === "外滩");
    if (bund) {
      expect(bund.reason).toBe("AI润色的拍摄理由");
      expect(bund.way).toBe("AI润色的拍摄方式");
      expect(bund.cameraSummary).toBe("AI润色的参数建议");
      expect(bund.tip).toBe("AI润色的小贴士");
    }
  });

  it("falls back gracefully when AI returns invalid JSON", async () => {
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => "not valid json at all"
    };

    const context = makeContext(aiProvider);
    const result = await photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    // Should still get a valid plan, just not AI-enhanced
    expect(result.type).toBe("photo_week");
    expect(result.days.length).toBe(7);
  });

  it("falls back to distinct base reasons when AI reuses the same photo reason template", async () => {
    const aiResponse = JSON.stringify({
      tips: ["注意天气变化"],
      days: [{
        date: "2026-03-22",
        spots: [
          {
            name: "外滩",
            reason: "作为初学者，建议提前 15 分钟到场观察光位和人流，再决定主机位。",
            way: "统一模板",
            cameraSummary: "统一模板",
            tip: "统一模板"
          },
          {
            name: "豫园",
            reason: "作为初学者，建议提前 15 分钟到场观察光位和人流，再决定主机位。",
            way: "统一模板",
            cameraSummary: "统一模板",
            tip: "统一模板"
          }
        ]
      }]
    });

    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => aiResponse
    };

    const result = await photoWeekScenario.plan(makeContext(aiProvider), {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    const firstDay = result.days.find((d) => d.date === "2026-03-22");
    expect(firstDay?.spots.length).toBeGreaterThanOrEqual(2);
    expect(new Set(firstDay?.spots.map((spot) => spot.reason)).size).toBe(firstDay?.spots.length);
  });

  it("falls back gracefully when AI throws an error", async () => {
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => { throw new Error("AI service down"); }
    };

    const context = makeContext(aiProvider);
    const result = await photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.type).toBe("photo_week");
    expect(result.meta.aiEnhanced).toBe(false);
  });

  it("handles AI response wrapped in markdown code fence", async () => {
    const aiResponse = '```json\n{"tips":["fenced tip"],"days":[]}\n```';
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => aiResponse
    };

    const context = makeContext(aiProvider);
    const result = await photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.meta.aiEnhanced).toBe(true);
    expect(result.tips).toEqual(["fenced tip"]);
  });

  it("falls back to primary POIs when expanded photo POI lookup fails", async () => {
    const forecast = makeForecast("2026-03-22");
    const primaryPois = [
      makePoi("p1", "外滩"),
      makePoi("p2", "豫园")
    ];
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
        searchRunPois: async () => [],
        searchPhotoPois: async () => {
          callCount += 1;
          if (callCount === 1) {
            return primaryPois;
          }

          throw new AppError("请求外部服务失败：429 Too Many Requests", 429);
        }
      },
      routingProvider: {
        name: "mock-routing",
        getWalkingRoute: async () => ({ distanceMeters: 3000, durationSeconds: 2400, source: "mock" })
      },
      navigationProvider: {
        name: "mock-nav",
        buildNavigationUrl: (coords, label) => `https://nav.test/${label}`
      },
      aiProvider: null
    };

    const result = await photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(callCount).toBe(2);
    expect(result.days.length).toBe(7);
    expect(result.days[0]?.spots.length).toBeGreaterThan(0);
  });
});
