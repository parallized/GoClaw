import {
  photoWeekPlanSchema,
  photoWeekRequestSchema,
  scenarioCatalog,
  type CameraSkill,
  type PlanCandidatesDataPayload,
  type PlanProcessStep,
  type PhotoSpot,
  type PhotoTheme,
  type PhotoWeekRequest,
  type PhotoWeekPlan
} from "@goclaw/contracts";
import type { DailyWeatherPoint, PointOfInterest } from "../service-types";
import type { ScenarioDefinition, ScenarioPlannerContext } from "../scenario-definition";
import { extractJsonBlock, safeJsonParse } from "../../lib/json-parser";
import { AppError, toErrorMessage } from "../../lib/errors";
import { emitPlanData, logPlanExecution, markExecutionStage, withExecutionStage } from "../../lib/plan-execution";
import { classifyLight, getWeatherLabel, summarizeDailyWeather } from "../../lib/weather";

const PHOTO_STAGE_IDS = {
  weather: "photo.weather",
  geocoding: "photo.geocoding",
  poi: "photo.poi",
  navigation: "photo.navigation",
  ai: "photo.ai"
} as const;

type PreparedPhotoSpot = {
  poi: PointOfInterest;
  spot: PhotoSpot;
};

type CandidatePhotoDay = {
  date: string;
  weather: string;
  day: DailyWeatherPoint;
  candidates: PreparedPhotoSpot[];
};

type PhotoAiSpot = {
  name: string;
  reason?: string;
  way?: string;
  cameraSummary?: string;
  tip?: string;
};

type PhotoAiDay = {
  date: string;
  spots: PhotoAiSpot[];
};

type PhotoAiAnalysis = {
  tips: string[];
  days: PhotoAiDay[];
};

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

function buildPhotoTip(day: DailyWeatherPoint, themes: readonly string[]): string {
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

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asTrimmedString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizePhotoAiSpots(value: unknown): PhotoAiSpot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const name = asTrimmedString(record.name);
    if (!name) {
      return [];
    }

    return [{
      name,
      reason: asTrimmedString(record.reason),
      way: asTrimmedString(record.way),
      cameraSummary: asTrimmedString(record.cameraSummary),
      tip: asTrimmedString(record.tip)
    }];
  });
}

function normalizePhotoAiDays(value: unknown): PhotoAiDay[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const date = asTrimmedString(record.date);
    if (!date) {
      return [];
    }

    return [{
      date,
      spots: normalizePhotoAiSpots(record.spots)
    }];
  });
}

function normalizePhotoAiAnalysis(value: unknown): PhotoAiAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    tips: normalizeStringList(record.tips),
    days: normalizePhotoAiDays(record.days)
  };
}

async function loadPhotoPois(context: ScenarioPlannerContext, location: { latitude: number; longitude: number }, radiusKm: number) {
  const radiusMeters = Math.min(30000, Math.max(4000, radiusKm * 1000));
  logPlanExecution("info", `按 ${radiusMeters} 米半径搜索摄影点位`);
  const primary = await context.poiProvider.searchPhotoPois(location, radiusMeters);
  if (primary.length >= 6) {
    logPlanExecution("info", `首轮搜索已获得 ${primary.length} 个摄影点位`);
    return primary;
  }

  try {
    const expandedRadius = Math.min(radiusMeters + 6000, 30000);
    logPlanExecution("warn", `首轮点位仅 ${primary.length} 个，扩展到 ${expandedRadius} 米继续搜索`);
    const expanded = await context.poiProvider.searchPhotoPois(location, expandedRadius);
    logPlanExecution("info", `扩圈搜索后共获得 ${expanded.length} 个摄影点位`);
    return expanded;
  } catch (error) {
    logPlanExecution("warn", "扩圈摄影点位搜索失败，回退为首轮结果", toErrorMessage(error));
    return primary;
  }
}

function buildPhotoCandidatePool(pois: readonly PointOfInterest[]): PlanCandidatesDataPayload {
  const usableCandidates = pois.map((poi) => ({
    ...poi,
    qualityTier: "usable" as const
  }));

  return {
    rawCandidates: usableCandidates,
    usableCandidates,
    recommendedCandidates: usableCandidates.slice(0, 8).map((poi) => ({
      ...poi,
      qualityTier: "recommended" as const
    })),
    minimumSatisfied: usableCandidates.length > 0
  };
}

function buildPhotoProcessSteps(context: ScenarioPlannerContext, dayCount?: number): PlanProcessStep[] {
  return [
    {
      id: PHOTO_STAGE_IDS.weather,
      title: "天气评估",
      detail: dayCount === undefined
        ? "拉取未来天气，按光线、云量与降水安排每日更合适的拍摄窗口。"
        : `拉取未来 ${dayCount} 天天气，按光线、云量与降水安排每日更合适的拍摄窗口。`,
      provider: context.weatherProvider.name,
      outcome: "success"
    },
    {
      id: PHOTO_STAGE_IDS.geocoding,
      title: "位置识别",
      detail: "根据当前坐标解析城市与区域，用于生成本周计划和地点说明。",
      provider: context.geocodingProvider.name,
      outcome: "success"
    },
    {
      id: PHOTO_STAGE_IDS.poi,
      title: "拍摄地点筛选",
      detail: "从真实 POI 中筛选景观点、公园、水边与人文点位，并按题材匹配度分配到每天。",
      provider: context.poiProvider.name,
      outcome: "success"
    },
    {
      id: PHOTO_STAGE_IDS.navigation,
      title: "导航生成",
      detail: "为每个推荐点生成可直接跳转的导航链接，便于按天出发。",
      provider: context.navigationProvider.name,
      outcome: "success"
    },
    {
      id: PHOTO_STAGE_IDS.ai,
      title: "AI 综合分析",
      detail: context.aiProvider
        ? "结合用户主题偏好分析真实候选点位，挑选每日更合适的拍摄组合并生成说明。"
        : "当前未启用 AI 润色，直接返回基于真实数据生成的确定性结果。",
      provider: context.aiProvider?.name,
      outcome: context.aiProvider ? "success" : "skipped"
    }
  ];
}

function scorePoi(day: DailyWeatherPoint, poi: PointOfInterest, usedTimes: number): number {
  let score = 100 - poi.distanceMeters / 1500 - usedTimes * 12;

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

function buildPreparedPhotoSpot(
  day: DailyWeatherPoint,
  poi: PointOfInterest,
  light: ReturnType<typeof classifyLight>,
  cameraSkill: CameraSkill | undefined,
  navigationProvider: ScenarioPlannerContext["navigationProvider"]
): PreparedPhotoSpot {
  const bestTime = bestTimeForDay(day, poi.themes);
  const camera = cameraPreset(light, cameraSkill, poi.themes);

  return {
    poi,
    spot: {
      name: poi.name,
      reason: buildPhotoReason(day, poi),
      bestTime,
      way: buildPhotoWay(light, poi),
      camera,
      cameraSummary: `建议 ${camera.iso}、${camera.aperture}、${camera.shutter}、${camera.whiteBalance}，优先确保主体清晰和高光不过曝。`,
      tip: buildPhotoTip(day, poi.themes),
      categories: poi.themes,
      navigationUrl: navigationProvider.buildNavigationUrl(poi.coordinates, poi.name),
      poiCoordinates: poi.coordinates
    }
  };
}

function orderPreparedPhotoSpots(
  candidates: PreparedPhotoSpot[],
  aiSpots?: PhotoAiSpot[],
  limit = 2
): PreparedPhotoSpot[] {
  const byName = new Map(candidates.map((candidate) => [candidate.spot.name, candidate]));
  const ordered: PreparedPhotoSpot[] = [];
  const seen = new Set<string>();

  for (const spot of aiSpots ?? []) {
    const matched = byName.get(spot.name);
    if (!matched || seen.has(matched.spot.name)) {
      continue;
    }

    seen.add(matched.spot.name);
    ordered.push(matched);
    if (ordered.length >= limit) {
      return ordered;
    }
  }

  for (const candidate of candidates) {
    if (seen.has(candidate.spot.name)) {
      continue;
    }

    seen.add(candidate.spot.name);
    ordered.push(candidate);
    if (ordered.length >= limit) {
      break;
    }
  }

  return ordered;
}

function buildPhotoDay(
  candidateDay: CandidatePhotoDay,
  selectedCandidates: PreparedPhotoSpot[],
  aiSpots?: PhotoAiSpot[]
) {
  const aiByName = new Map((aiSpots ?? []).map((spot) => [spot.name, spot]));
  const spots: PhotoSpot[] = selectedCandidates.map(({ spot }) => {
    const aiSpot = aiByName.get(spot.name);
    return {
      ...spot,
      reason: aiSpot?.reason?.trim() || spot.reason,
      way: aiSpot?.way?.trim() || spot.way,
      cameraSummary: aiSpot?.cameraSummary?.trim() || spot.cameraSummary,
      tip: aiSpot?.tip?.trim() || spot.tip
    };
  });
  const categories = spots.flatMap((spot) => spot.categories);

  return {
    date: candidateDay.date,
    weather: candidateDay.weather,
    spots,
    tips: [buildPhotoTip(candidateDay.day, categories)]
  };
}

async function analyzePhotoCandidates(
  context: ScenarioPlannerContext,
  input: PhotoWeekRequest,
  candidateDays: CandidatePhotoDay[]
): Promise<PhotoAiAnalysis | null> {
  try {
    const aiProvider = context.aiProvider;
    if (!aiProvider) {
      return null;
    }

    const response = await aiProvider.generateText({
      system: [
        "你是摄影规划分析师，需要结合用户主题偏好，从每天已经准备好的真实候选点位中挑选并排序最多 2 个拍摄点。",
        "用户选择的 themes 标签只用于分析与排序，不是 POI 获取约束。",
        "不得新增日期、地点、天气、参数或题材标签，也不得改写候选点名称。",
        "每一天只能从对应 candidates 里选择 spot.name；如果用户未给 themes，就优先考虑天气契合度、拍摄效率和一周内的整体多样性。",
        "reason、way、cameraSummary、tip 只能围绕已给事实做更贴合用户偏好的表达，不要虚构新的相机数值。",
        "输出 JSON，字段仅包含 tips 和 days；days 内仅包含 date 和 spots，spots 内仅包含 name、reason、way、cameraSummary、tip。"
      ].join(""),
      user: JSON.stringify({
        preferences: {
          themes: input.preferences?.themes ?? [],
          cameraSkill: input.preferences?.cameraSkill
        },
        days: candidateDays.map((day) => ({
          date: day.date,
          weather: day.weather,
          candidates: day.candidates.map(({ spot }) => ({
            name: spot.name,
            bestTime: spot.bestTime,
            categories: spot.categories,
            reason: spot.reason,
            way: spot.way,
            cameraSummary: spot.cameraSummary,
            tip: spot.tip
          }))
        }))
      }),
      temperature: 0.45
    });

    const parsed = safeJsonParse<unknown>(extractJsonBlock(response));
    const normalized = normalizePhotoAiAnalysis(parsed);
    if (!normalized) {
      logPlanExecution("warn", "AI 返回内容无法解析，保留原始摄影结果");
      return null;
    }

    return normalized;
  } catch (error) {
    logPlanExecution("warn", "AI 摄影分析失败，保留原始摄影结果", toErrorMessage(error));
    return null;
  }
}

export const photoWeekScenario: ScenarioDefinition<typeof photoWeekRequestSchema, typeof photoWeekPlanSchema> = {
  id: "photo_week",
  manifest: manifest(),
  inputSchema: photoWeekRequestSchema,
  outputSchema: photoWeekPlanSchema,
  getExecutionStages(context) {
    return buildPhotoProcessSteps(context);
  },
  async plan(context, input) {
    const [forecast, place, pois] = await Promise.all([
      withExecutionStage(PHOTO_STAGE_IDS.weather, async () => {
        logPlanExecution("info", "开始拉取未来 7 天摄影相关天气数据");
        const weather = await context.weatherProvider.getForecast(input.location, input.timezone, 7);
        logPlanExecution("info", `天气数据拉取完成：${weather.daily.length} 天、${weather.hourly.length} 条逐小时记录`);
        
        const weatherLabel = weather.daily[0] ? summarizeDailyWeather(weather.daily[0]) : "";
        emitPlanData("weather", { label: weatherLabel });
        
        return weather;
      }),
      withExecutionStage(PHOTO_STAGE_IDS.geocoding, async () => {
        logPlanExecution("info", "开始解析当前位置名称");
        const resolvedPlace = await context.geocodingProvider.reverseGeocode(input.location);
        logPlanExecution("info", `位置解析完成：${resolvedPlace.displayName}`);
        return resolvedPlace;
      }),
      withExecutionStage(PHOTO_STAGE_IDS.poi, async () => {
        logPlanExecution("info", "开始搜索周边真实摄影点位");
        const resolvedPois = await loadPhotoPois(context, input.location, input.preferences?.mobilityRadiusKm ?? 12);
        logPlanExecution("info", `摄影点位筛选完成：共获得 ${resolvedPois.length} 个候选点`);
        
        emitPlanData("candidates", buildPhotoCandidatePool(resolvedPois));
        return resolvedPois;
      })
    ]);

    if (pois.length === 0) {
      logPlanExecution("error", "附近未找到可用于拍照推荐的真实 POI", undefined, PHOTO_STAGE_IDS.poi);
      throw new AppError("当前位置附近暂未找到可用于拍照推荐的真实 POI，请尝试扩大活动半径后重试。", 404);
    }

    const usage = new Map<string, number>();

    const candidateDays = await withExecutionStage(PHOTO_STAGE_IDS.navigation, async () => {
      logPlanExecution("info", `开始生成 ${forecast.daily.slice(0, 7).length} 天的摄影日程与导航链接`);

      const resolvedDays = forecast.daily.slice(0, 7).map((day) => {
        const relatedHour = forecast.hourly.find((hour) => hour.time.startsWith(day.date) && hour.time.endsWith("07:00"));
        const light = classifyLight(day, relatedHour);
        const candidates = pois
          .map((poi) => ({
            poi,
            score: scorePoi(day, poi, usage.get(poi.id) ?? 0)
          }))
          .sort((left, right) => right.score - left.score)
          .slice(0, 4)
          .map((item) => buildPreparedPhotoSpot(day, item.poi, light, input.preferences?.cameraSkill, context.navigationProvider));

        const selectedCandidates = candidates.slice(0, 2);
        for (const candidate of selectedCandidates) {
          usage.set(candidate.poi.id, (usage.get(candidate.poi.id) ?? 0) + 1);
        }

        logPlanExecution("info", `${day.date} 预生成了 ${candidates.length} 个真实摄影候选点位`);

        return {
          date: day.date,
          weather: summarizeDailyWeather(day),
          day,
          candidates
        };
      });

      logPlanExecution("info", "本周摄影计划与导航链接生成完成");
      return resolvedDays;
    });

    const days = candidateDays.map((day) => buildPhotoDay(day, day.candidates.slice(0, 2)));

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

    if (!context.aiProvider) {
      markExecutionStage(PHOTO_STAGE_IDS.ai, "skipped");
      logPlanExecution("info", "未启用 AI 综合分析，直接返回基于真实数据的结果", undefined, PHOTO_STAGE_IDS.ai);
      return basePlan;
    }

    return await withExecutionStage(PHOTO_STAGE_IDS.ai, async () => {
      logPlanExecution("info", "开始执行 AI 摄影偏好分析");
      const aiAnalysis = await analyzePhotoCandidates(context, input, candidateDays);
      if (!aiAnalysis) {
        logPlanExecution("info", "AI 未产出可用摄影分析结果，已保留原始计划");
        return basePlan;
      }

      const aiTips = aiAnalysis.tips.slice(0, 4);
      const enhanced: PhotoWeekPlan = {
        ...basePlan,
        tips: aiTips && aiTips.length > 0 ? aiTips : basePlan.tips,
        days: candidateDays.map((day) => {
          const aiDay = aiAnalysis.days.find((item) => item.date === day.date);
          const orderedCandidates = orderPreparedPhotoSpots(day.candidates, aiDay?.spots);
          return buildPhotoDay(day, orderedCandidates, aiDay?.spots);
        }),
        meta: {
          ...basePlan.meta,
          aiEnhanced: true
        }
      };

      logPlanExecution(
        "info",
        enhanced.meta.aiEnhanced ? "AI 摄影分析完成" : "AI 未产出可用结果，已保留原始摄影文案"
      );
      return enhanced;
    });
  }
};
