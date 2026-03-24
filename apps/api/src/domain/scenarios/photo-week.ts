import {
  photoWeekPlanSchema,
  photoWeekRequestSchema,
  scenarioCatalog,
  type CameraSkill,
  type PlanProcessStep,
  type PhotoTheme,
  type PhotoWeekPlan
} from "@goplan/contracts";
import type { DailyWeatherPoint, PointOfInterest } from "../service-types";
import type { ScenarioDefinition, ScenarioPlannerContext } from "../scenario-definition";
import { extractJsonBlock, safeJsonParse } from "../../lib/json-parser";
import { AppError } from "../../lib/errors";
import { classifyLight, getWeatherLabel, summarizeDailyWeather } from "../../lib/weather";

function manifest() {
  const found = scenarioCatalog.find((item) => item.id === "photo_week");
  if (!found) {
    throw new Error("缺少 photo_week manifest");
  }

  return found;
}

function cameraPreset(light: ReturnType<typeof classifyLight>, skill: CameraSkill | undefined, themes: PhotoTheme[]) {
  if (themes.includes("night")) {
    return {
      iso: skill === "advanced" ? "ISO 400" : "ISO 640",
      aperture: skill === "advanced" ? "f/2.8" : "f/1.8-f/2.8",
      shutter: skill === "advanced" ? "1/15s（三脚架优先）" : "1/30s",
      whiteBalance: "3800K-4500K"
    };
  }

  switch (light) {
    case "sunrise":
      return { iso: "ISO 100", aperture: "f/5.6-f/8", shutter: "1/125s", whiteBalance: "5200K" };
    case "sunset":
      return { iso: "ISO 100-200", aperture: "f/5.6-f/8", shutter: "1/160s", whiteBalance: "5600K" };
    case "dramatic":
      return { iso: "ISO 100-200", aperture: "f/4-f/5.6", shutter: "1/200s", whiteBalance: "6000K" };
    case "overcast":
      return { iso: "ISO 200-400", aperture: "f/4", shutter: "1/250s", whiteBalance: "6500K" };
    default:
      return { iso: "ISO 100", aperture: "f/4-f/5.6", shutter: "1/250s", whiteBalance: "5400K" };
  }
}

function bestTimeForDay(day: DailyWeatherPoint, themes: PhotoTheme[]): string {
  const sunrise = day.sunrise.split("T")[1] ?? "06:00";
  const sunset = day.sunset.split("T")[1] ?? "18:00";

  if (themes.includes("night")) {
    return `蓝调时刻 ${sunset} 后 20-40 分钟`;
  }

  if (getWeatherLabel(day.weatherCode).includes("晴") || day.uvIndexMax <= 5.5) {
    return `日出后 30-60 分钟（参考 ${sunrise}）`;
  }

  if (day.precipitationProbabilityMax >= 45) {
    return "建议中午前后机动拍摄，并预留室内备选点位";
  }

  return `日落前 45 分钟（参考 ${sunset}）`;
}

function buildPhotoReason(day: DailyWeatherPoint, poi: PointOfInterest): string {
  if (poi.themes.includes("waterfront")) {
    return `这一天 ${summarizeDailyWeather(day)}，水边题材更容易获得通透层次与倒影。`;
  }

  if (poi.themes.includes("architecture")) {
    return `这一天 ${summarizeDailyWeather(day)}，建筑题材更适合拍线条、秩序感和城市空间。`;
  }

  if (poi.themes.includes("nature")) {
    return `这一天 ${summarizeDailyWeather(day)}，自然景观更容易得到柔和色彩和稳定光线。`;
  }

  return `这一天 ${summarizeDailyWeather(day)}，这里能兼顾天气稳定性与出片效率。`;
}

function buildPhotoWay(light: ReturnType<typeof classifyLight>, poi: PointOfInterest): string {
  if (light === "sunrise") {
    return `优先寻找朝向开阔的一侧，用引导线把视线带向 ${poi.name} 主体。`;
  }

  if (light === "sunset") {
    return `尝试逆光或侧逆光构图，保留高光层次，让 ${poi.name} 的轮廓更有故事感。`;
  }

  if (light === "overcast") {
    return "阴天更适合拍细节、人物环境照和局部纹理，尽量减少空白天空。";
  }

  return "利用云层或城市元素做画面分区，保持前中后景层次，让画面更完整。";
}

function buildPhotoTip(day: DailyWeatherPoint, themes: PhotoTheme[]): string {
  if (themes.includes("night")) {
    return "夜景优先准备三脚架或稳定支撑，避免慢快门糊片。";
  }

  if (day.precipitationProbabilityMax >= 45) {
    return "降水概率较高，建议准备镜头布和防水袋，并预留室内备选机位。";
  }

  if (day.uvIndexMax >= 6) {
    return "紫外线偏强，中午不建议长时间暴晒，可把主拍时段放到早晚。";
  }

  return "建议提前 15 分钟到场观察光位和人流，再决定主机位。";
}

async function loadPhotoPois(context: ScenarioPlannerContext, location: { latitude: number; longitude: number }, radiusKm: number) {
  const radiusMeters = Math.min(30000, Math.max(4000, radiusKm * 1000));
  const primary = await context.poiProvider.searchPhotoPois(location, radiusMeters);
  if (primary.length >= 6) {
    return primary;
  }

  try {
    return await context.poiProvider.searchPhotoPois(location, Math.min(radiusMeters + 6000, 30000));
  } catch {
    return primary;
  }
}

function buildPhotoProcessSteps(context: ScenarioPlannerContext, dayCount: number): PlanProcessStep[] {
  return [
    {
      title: "天气评估",
      detail: `拉取未来 ${dayCount} 天天气，按光线、云量与降水安排每日更合适的拍摄窗口。`,
      provider: context.weatherProvider.name,
      outcome: "success"
    },
    {
      title: "位置识别",
      detail: "根据当前坐标解析城市与区域，用于生成本周计划和地点说明。",
      provider: context.geocodingProvider.name,
      outcome: "success"
    },
    {
      title: "拍摄地点筛选",
      detail: "从真实 POI 中筛选景观点、公园、水边与人文点位，并按题材匹配度分配到每天。",
      provider: context.poiProvider.name,
      outcome: "success"
    },
    {
      title: "导航生成",
      detail: "为每个推荐点生成可直接跳转的导航链接，便于按天出发。",
      provider: context.navigationProvider.name,
      outcome: "success"
    },
    {
      title: "文案润色",
      detail: context.aiProvider
        ? "在不新增虚构地点、天气或参数的前提下，轻量润色拍摄理由和提示。"
        : "当前未启用 AI 润色，直接返回基于真实数据生成的确定性结果。",
      provider: context.aiProvider?.name,
      outcome: context.aiProvider ? "success" : "skipped"
    }
  ];
}

function scorePoi(day: DailyWeatherPoint, poi: PointOfInterest, preferredThemes: Set<PhotoTheme>, usedTimes: number): number {
  let score = 100 - poi.distanceMeters / 1500 - usedTimes * 12;
  score += poi.themes.filter((theme) => preferredThemes.has(theme)).length * 18;

  if (poi.themes.includes("nature") && day.precipitationProbabilityMax <= 30) {
    score += 12;
  }
  if (poi.themes.includes("architecture") && day.weatherCode >= 1 && day.weatherCode <= 3) {
    score += 10;
  }
  if (poi.themes.includes("waterfront") && day.precipitationProbabilityMax <= 35) {
    score += 12;
  }
  if (poi.themes.includes("urban") && day.precipitationProbabilityMax >= 20) {
    score += 6;
  }

  return score;
}

async function enhancePlan(context: ScenarioPlannerContext, plan: PhotoWeekPlan): Promise<PhotoWeekPlan> {
  if (!context.aiProvider) {
    return plan;
  }

  try {
    const response = await context.aiProvider.generateText({
      system: "你是摄影规划编辑。你只能润色已有事实，不得新增日期、地点、天气或参数。输出 JSON，字段仅包含 tips 和 days。",
      user: JSON.stringify({
        tips: plan.tips,
        days: plan.days.map((day) => ({
          date: day.date,
          spots: day.spots.map((spot) => ({
            name: spot.name,
            reason: spot.reason,
            way: spot.way,
            cameraSummary: spot.cameraSummary,
            tip: spot.tip
          }))
        }))
      }),
      temperature: 0.4
    });

    const parsed = safeJsonParse<{ tips?: string[]; days?: Array<{ date: string; spots?: Array<{ name: string; reason?: string; way?: string; cameraSummary?: string; tip?: string }> }> }>(extractJsonBlock(response));
    if (!parsed) {
      return plan;
    }

    return {
      ...plan,
      tips: parsed.tips?.filter(Boolean).slice(0, 4) ?? plan.tips,
      days: plan.days.map((day) => {
        const aiDay = parsed.days?.find((item) => item.date === day.date);
        return {
          ...day,
          spots: day.spots.map((spot) => {
            const aiSpot = aiDay?.spots?.find((item) => item.name === spot.name);
            return {
              ...spot,
              reason: aiSpot?.reason?.trim() || spot.reason,
              way: aiSpot?.way?.trim() || spot.way,
              cameraSummary: aiSpot?.cameraSummary?.trim() || spot.cameraSummary,
              tip: aiSpot?.tip?.trim() || spot.tip
            };
          })
        };
      }),
      meta: {
        ...plan.meta,
        aiEnhanced: true
      }
    };
  } catch {
    return plan;
  }
}

export const photoWeekScenario: ScenarioDefinition<typeof photoWeekRequestSchema, typeof photoWeekPlanSchema> = {
  id: "photo_week",
  manifest: manifest(),
  inputSchema: photoWeekRequestSchema,
  outputSchema: photoWeekPlanSchema,
  async plan(context, input) {
    const [forecast, place, pois] = await Promise.all([
      context.weatherProvider.getForecast(input.location, input.timezone, 7),
      context.geocodingProvider.reverseGeocode(input.location),
      loadPhotoPois(context, input.location, input.preferences?.mobilityRadiusKm ?? 12)
    ]);

    if (pois.length === 0) {
      throw new AppError("当前位置附近暂未找到可用于拍照推荐的真实 POI，请尝试扩大活动半径后重试。", 404);
    }

    const preferredThemes = new Set(input.preferences?.themes ?? []);
    const usage = new Map<string, number>();

    const days = forecast.daily.slice(0, 7).map((day) => {
      const relatedHour = forecast.hourly.find((hour) => hour.time.startsWith(day.date) && hour.time.endsWith("07:00"));
      const light = classifyLight(day, relatedHour);
      const selectedPois = pois
        .map((poi) => ({
          poi,
          score: scorePoi(day, poi, preferredThemes, usage.get(poi.id) ?? 0)
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, 2)
        .map((item) => item.poi);

      const spots = selectedPois.map((poi) => {
        usage.set(poi.id, (usage.get(poi.id) ?? 0) + 1);
        const bestTime = bestTimeForDay(day, poi.themes);
        const camera = cameraPreset(light, input.preferences?.cameraSkill, poi.themes);

        return {
          name: poi.name,
          reason: buildPhotoReason(day, poi),
          bestTime,
          way: buildPhotoWay(light, poi),
          camera,
          cameraSummary: `建议 ${camera.iso}、${camera.aperture}、${camera.shutter}、${camera.whiteBalance}，优先确保主体清晰和高光不过曝。`,
          tip: buildPhotoTip(day, poi.themes),
          categories: poi.themes,
          navigationUrl: context.navigationProvider.buildNavigationUrl(poi.coordinates, poi.name),
          poiCoordinates: poi.coordinates
        };
      });

      return {
        date: day.date,
        weather: summarizeDailyWeather(day),
        spots,
        tips: [buildPhotoTip(day, spots.flatMap((spot) => spot.categories))]
      };
    });

    const basePlan: PhotoWeekPlan = {
      type: "photo_week",
      city: place.city,
      rangeLabel: `${forecast.daily[0]?.date ?? ""} 至 ${forecast.daily.at(-1)?.date ?? ""}`,
      days,
      tips: [
        "优先把晴天留给自然/水边题材，把多云天留给建筑和人文题材。",
        "建议每天出发前 30 分钟再次确认天气变化，必要时切换到室内或檐下机位。"
      ],
      meta: {
        weatherProvider: context.weatherProvider.name,
        poiProvider: context.poiProvider.name,
        routingProvider: context.routingProvider.name,
        aiEnhanced: false,
        process: buildPhotoProcessSteps(context, days.length)
      }
    };

    return enhancePlan(context, basePlan);
  }
};
