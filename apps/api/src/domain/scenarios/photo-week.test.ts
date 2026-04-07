import { describe, expect, it, mock, afterEach, spyOn } from "bun:test";
import type { AiProvider, WeatherForecast, PointOfInterest, RoutePlan } from "../service-types";
import type { ScenarioPlannerContext } from "../scenario-definition";
import { AppError } from "../../lib/errors";
import { photoWeekScenario } from "./photo-week";

const PHOTO_POI_NAMES = ["外滩", "豫园", "南京路步行街", "人民广场", "新天地", "田子坊"] as const;

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

function makePoiWithRawTagArrays(id: string, name: string): PointOfInterest {
  return {
    ...makePoi(id, name),
    rawTags: {
      type: "风景名胜;公园广场;公园",
      district: "西湖区",
      address: [] as unknown as string,
      city: [] as unknown as string
    }
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

function makePhotoAiProvider(
  dates: string[],
  spotNames: string[] = ["外滩", "豫园"]
): AiProvider {
  return {
    name: "mock-ai",
    generateText: async () => JSON.stringify({
      tips: ["AI 建议按题材分配停留时间", "AI 建议优先走主景再补细节"],
      days: dates.map((date) => ({
        date,
        spots: spotNames.map((name, index) => ({
          name,
          reason: `${name} 更适合当天的拍摄氛围和主题取向。`,
          way: `${name} 建议从第 ${index + 1} 个观察角度开始拍。`,
          cameraSummary: `${name} 优先控制曝光，再决定是否压高光。`,
          tip: `${name} 可以先停留一圈，再决定主机位。`
        }))
      }))
    })
  };
}

function makeContext(aiProvider?: AiProvider | null): ScenarioPlannerContext {
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
    aiProvider: aiProvider === undefined ? makePhotoAiProvider(forecast.daily.map((day) => day.date)) : aiProvider
  };
}

describe("photoWeekScenario - AI enhancement", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns 503 when AI provider is unavailable", async () => {
    const context = makeContext(null);
    await expect(photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
  });

  it("enhances plan with AI provider", async () => {
    const aiResponse = JSON.stringify({
      tips: ["AI增强提示1", "AI增强提示2"],
      days: makeForecast("2026-03-22").daily.map((day) => ({
        date: day.date,
        spots: PHOTO_POI_NAMES.map((name, index) => ({
          name,
          reason: day.date === "2026-03-22" && name === "外滩" ? "AI润色的拍摄理由" : `${day.date} ${name} 的 AI 理由`,
          way: day.date === "2026-03-22" && name === "外滩" ? "AI润色的拍摄方式" : `${day.date} ${name} 的 AI 方式`,
          cameraSummary: day.date === "2026-03-22" && name === "外滩" ? "AI润色的参数建议" : `${day.date} ${name} 的 AI 参数`,
          tip: day.date === "2026-03-22" && name === "外滩" ? "AI润色的小贴士" : `${day.date} ${name} 的 AI 提示`
        }))
      }))
    });

    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async (input) => {
        expect(input.system).toContain("description");
        expect(input.system).toContain("不要写“提前 15 分钟到场观察光位和人流”");
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

  it("returns 503 when AI returns invalid JSON", async () => {
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => "not valid json at all"
    };

    const context = makeContext(aiProvider);
    await expect(photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
  });

  it("returns 503 when AI reuses the same photo reason template", async () => {
    const aiResponse = JSON.stringify({
      tips: ["注意天气变化"],
      days: makeForecast("2026-03-22").daily.map((day) => ({
        date: day.date,
        spots: [
          {
            name: "外滩",
            reason: "统一的拍摄理由模板",
            way: "统一模板",
            cameraSummary: "统一模板参数",
            tip: "统一模板提示"
          },
          {
            name: "豫园",
            reason: "统一的拍摄理由模板",
            way: "统一模板",
            cameraSummary: "统一模板参数二",
            tip: "统一模板提示二"
          }
        ]
      }))
    });

    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => aiResponse
    };

    await expect(photoWeekScenario.plan(makeContext(aiProvider), {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
  });

  it("returns 503 when AI throws an error", async () => {
    const aiProvider: AiProvider = {
      name: "mock-ai",
      generateText: async () => { throw new Error("AI service down"); }
    };

    const context = makeContext(aiProvider);
    await expect(photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    })).rejects.toMatchObject({
      status: 503
    });
  });

  it("handles AI response wrapped in markdown code fence", async () => {
    const aiResponse = `\`\`\`json\n${JSON.stringify({
      tips: ["fenced tip"],
      days: makeForecast("2026-03-22").daily.map((day) => ({
        date: day.date,
        spots: PHOTO_POI_NAMES.map((name) => ({
          name,
          reason: `${day.date} ${name} 的 fenced 理由`,
          way: `${day.date} ${name} 的 fenced 方式`,
          cameraSummary: `${day.date} ${name} 的 fenced 参数`,
          tip: `${day.date} ${name} 的 fenced 提示`
        }))
      }))
    })}\n\`\`\``;
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
      aiProvider: makePhotoAiProvider(forecast.daily.map((day) => day.date), ["外滩"])
    };

    const result = await photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(callCount).toBe(2);
    expect(result.days.length).toBe(7);
    expect(result.days[0]?.spots.length).toBeGreaterThan(0);
  });

  it("handles photo POIs whose raw tags contain non-string values", async () => {
    const forecast = makeForecast("2026-03-22");
    const pois = [
      makePoiWithRawTagArrays("p1", "外滩"),
      makePoi("p2", "豫园"),
      makePoi("p3", "南京路步行街"),
      makePoi("p4", "人民广场"),
      makePoi("p5", "新天地"),
      makePoi("p6", "田子坊")
    ];

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
        searchPhotoPois: async () => pois
      },
      routingProvider: {
        name: "mock-routing",
        getWalkingRoute: async () => ({ distanceMeters: 3000, durationSeconds: 2400, source: "mock" })
      },
      navigationProvider: {
        name: "mock-nav",
        buildNavigationUrl: (_coords, label) => `https://nav.test/${label}`
      },
      aiProvider: makePhotoAiProvider(forecast.daily.map((day) => day.date), [...PHOTO_POI_NAMES])
    };

    const result = await photoWeekScenario.plan(context, {
      location: { latitude: 31.23, longitude: 121.47 },
      timezone: "Asia/Shanghai"
    });

    expect(result.type).toBe("photo_week");
    expect(result.days.length).toBe(7);
    expect(result.days[0]?.spots.length).toBeGreaterThan(0);
  });
});
