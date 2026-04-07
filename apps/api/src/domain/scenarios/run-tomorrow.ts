import {
  type PlanCandidatesDataPayload,
  runPlanRequestSchema,
  runPlanSchema,
  scenarioCatalog,
  type PlanProcessStep,
  type RunPlan,
  type RunPlanRequest,
  type RunRoute,
  type TimeWindow
} from "@goclaw/contracts";
import type { HourlyWeatherPoint, PointOfInterest } from "../service-types";
import type { ScenarioDefinition, ScenarioPlannerContext } from "../scenario-definition";
import { extractJsonBlock, safeJsonParse } from "../../lib/json-parser";
import { AppError, toErrorMessage } from "../../lib/errors";
import { describePointOfInterest, withPoiDescription } from "../../lib/poi-description";
import { emitPlanData, logPlanExecution, withExecutionStage } from "../../lib/plan-execution";
import { scoreRunHour, summarizeDailyWeather } from "../../lib/weather";

const RUN_STAGE_IDS = {
  weather: "run.weather",
  geocoding: "run.geocoding",
  poi: "run.poi",
  routing: "run.routing",
  ai: "run.ai"
} as const;

const RUN_AI_REQUIRED_ERROR = "AI 跑步建议暂时不可用。为避免返回模板化推荐，请稍后重试。";

const DEFAULT_RUN_WINDOW: TimeWindow = {
  from: "05:00",
  to: "21:00"
};

type ScoredHour = {
  hour: HourlyWeatherPoint;
  score: number;
};

type ScheduledRouteSlot = {
  recommendedTime: string;
  timeWindow: TimeWindow;
  hour: HourlyWeatherPoint;
};

type RoutedCandidate = {
  poi: PointOfInterest;
  distanceKm: number;
  estTimeMin: number;
  navigationUrl: string;
  routeSource: string;
};

type RunAiRoute = {
  name: string;
  why?: string;
};

type RunAiAnalysis = {
  reason?: string;
  routes: RunAiRoute[];
  tips: string[];
};

type RunDistanceProfile = {
  preferredMinKm: number;
  preferredMaxKm: number;
  preferredCenterKm: number;
  routeFilterMinKm: number;
  routeFilterMaxKm: number;
  poiMinMeters: number;
  poiMaxMeters: number;
  poiTargetMeters: number;
  searchRadiusMeters: number;
  minRawCandidates: number;
  minUsableCandidates: number;
};

function manifest() {
  const found = scenarioCatalog.find((item) => item.id === "run_tomorrow");
  if (!found) {
    throw new Error("缺少 run_tomorrow manifest");
  }

  return found;
}

function getTomorrowDate(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const pick = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const date = new Date(Date.UTC(pick("year"), pick("month") - 1, pick("day") + 1));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeToMinutes(time: string): number {
  const parts = time.split(":").map((value) => Number(value));
  const hour = parts[0] ?? 0;
  const minute = parts[1] ?? 0;
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isoToTime(time: string): string {
  return time.split("T")[1] ?? "07:00";
}

function normalizeTimeWindow(startWindow?: TimeWindow): TimeWindow {
  const from = startWindow?.from ?? DEFAULT_RUN_WINDOW.from;
  const to = startWindow?.to ?? DEFAULT_RUN_WINDOW.to;
  const normalized: TimeWindow = {
    from: minutesToTime(Math.max(timeToMinutes(DEFAULT_RUN_WINDOW.from), timeToMinutes(from))),
    to: minutesToTime(Math.min(timeToMinutes(DEFAULT_RUN_WINDOW.to), timeToMinutes(to)))
  };

  return normalized.from <= normalized.to ? normalized : DEFAULT_RUN_WINDOW;
}

function buildWeatherReason(hour: HourlyWeatherPoint, framedWindow: TimeWindow): string {
  return `已在 ${framedWindow.from}-${framedWindow.to} 内筛过逐小时天气，${isoToTime(hour.time)} 前后体感 ${hour.apparentTemperatureC.toFixed(0)}℃、降水 ${hour.precipitationProbability.toFixed(0)}%、UV ${hour.uvIndex.toFixed(1)}，更适合作为明天的出发时段。`;
}

function buildRouteSummary(poi: PointOfInterest): string {
  if (poi.terrains.includes("shaded")) {
    return "树荫覆盖更稳定";
  }

  if (poi.terrains.includes("track")) {
    return "节奏更整齐，适合控配速";
  }

  if (poi.terrains.includes("waterfront")) {
    return "临水更通风，体感更轻松";
  }

  if (poi.terrains.includes("park")) {
    return "公园内连续性更好，适合完整跑完一段";
  }

  return "整体路况更平稳，适合按计划完成行程";
}

function buildRouteWhy(poi: PointOfInterest, slot: ScheduledRouteSlot): string {
  return `${buildRouteSummary(poi)}，${buildRouteFactSuffix(slot)}`;
}

function buildRouteFactSuffix(slot: ScheduledRouteSlot): string {
  return `建议 ${slot.recommendedTime} 出发，在 ${slot.timeWindow.from}-${slot.timeWindow.to} 完成；这个时段体感 ${slot.hour.apparentTemperatureC.toFixed(0)}℃、降水 ${slot.hour.precipitationProbability.toFixed(0)}%、UV ${slot.hour.uvIndex.toFixed(1)}。`;
}

function buildTips(bestTime: string, framedWindow: TimeWindow, temperatureMaxC: number, precipitationProbabilityMax: number, uvMax: number): string[] {
  const tips = [`建议在 ${bestTime} 前后 15 分钟热身，并尽量在 ${framedWindow.to} 前完成主要行程。`];

  if (temperatureMaxC >= 25) {
    tips.push("明天气温偏高，建议随身带水并穿着透气浅色衣物。");
  }

  if (uvMax >= 5) {
    tips.push("紫外线偏强，建议佩戴帽子并补涂防晒。");
  }

  if (precipitationProbabilityMax >= 35) {
    tips.push("存在降水概率，建议准备轻便雨具并注意湿滑路面。");
  }

  if (tips.length === 1) {
    tips.push("跑后及时补充水分和简单碳水，帮助恢复。");
  }

  return tips;
}

function buildRouteTimeWindow(recommendedTime: string, estTimeMin: number, framedWindow: TimeWindow): TimeWindow {
  const framedStart = timeToMinutes(framedWindow.from);
  const framedEnd = timeToMinutes(framedWindow.to);
  const startMinutes = Math.max(framedStart, timeToMinutes(recommendedTime));
  const endMinutes = Math.min(framedEnd, startMinutes + Math.max(30, estTimeMin));

  if (endMinutes <= startMinutes) {
    const fallbackStart = Math.max(framedStart, framedEnd - Math.max(30, estTimeMin));
    return {
      from: minutesToTime(fallbackStart),
      to: framedWindow.to
    };
  }

  return {
    from: minutesToTime(startMinutes),
    to: minutesToTime(endMinutes)
  };
}

function formatKilometers(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function clampSearchRadius(radiusMeters: number, maxRadius = 15_000): number {
  return Math.min(maxRadius, Math.max(500, Math.round(radiusMeters / 100) * 100));
}

function buildRunDistanceProfile(input: RunPlanRequest): RunDistanceProfile {
  const preferredMinKm = input.preferences?.preferredDistanceKm?.min ?? 4;
  const preferredMaxKm = input.preferences?.preferredDistanceKm?.max ?? 8;
  const preferredCenterKm = (preferredMinKm + preferredMaxKm) / 2;
  const oneWayMinMeters = preferredMinKm * 500;
  const oneWayMaxMeters = preferredMaxKm * 500;
  const poiMinMeters = Math.max(500, Math.round(oneWayMinMeters * 0.75));
  const poiMaxMeters = Math.max(poiMinMeters + 300, Math.round(oneWayMaxMeters));

  return {
    preferredMinKm,
    preferredMaxKm,
    preferredCenterKm,
    routeFilterMinKm: Math.max(1.5, preferredMinKm * 0.7),
    routeFilterMaxKm: preferredMaxKm * 1.5,
    poiMinMeters,
    poiMaxMeters,
    poiTargetMeters: Math.round((poiMinMeters + poiMaxMeters) / 2),
    searchRadiusMeters: clampSearchRadius(oneWayMaxMeters),
    minRawCandidates: 6,
    minUsableCandidates: 3
  };
}

function distanceToRange(value: number, min: number, max: number): number {
  if (value < min) {
    return min - value;
  }

  if (value > max) {
    return value - max;
  }

  return 0;
}

function normalizeCopy(text: string): string {
  return text.replace(/[\s，。、“”‘’：:；;、,.!?！？（）()\-—]/g, "").toLowerCase();
}

function buildPoiKey(poi: PointOfInterest): string {
  return `${normalizeCopy(poi.name)}:${poi.coordinates.latitude.toFixed(4)}:${poi.coordinates.longitude.toFixed(4)}`;
}

function comparePoisByPreference(
  left: PointOfInterest,
  right: PointOfInterest,
  profile: RunDistanceProfile
): number {
  const leftBandGap = distanceToRange(left.distanceMeters, profile.poiMinMeters, profile.poiMaxMeters);
  const rightBandGap = distanceToRange(right.distanceMeters, profile.poiMinMeters, profile.poiMaxMeters);
  if (leftBandGap !== rightBandGap) {
    return leftBandGap - rightBandGap;
  }

  const leftTargetGap = Math.abs(left.distanceMeters - profile.poiTargetMeters);
  const rightTargetGap = Math.abs(right.distanceMeters - profile.poiTargetMeters);
  if (leftTargetGap !== rightTargetGap) {
    return leftTargetGap - rightTargetGap;
  }

  return left.distanceMeters - right.distanceMeters;
}

function prioritizeRunPoisByPreference(
  pois: readonly PointOfInterest[],
  profile: RunDistanceProfile
): PointOfInterest[] {
  const deduped: PointOfInterest[] = [];
  const seen = new Set<string>();

  for (const poi of pois) {
    const key = buildPoiKey(poi);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(poi);
  }

  return deduped.sort((left, right) => comparePoisByPreference(left, right, profile));
}

function countMileageMatchedPois(pois: readonly PointOfInterest[], profile: RunDistanceProfile): number {
  return pois.filter((poi) => distanceToRange(poi.distanceMeters, profile.poiMinMeters, profile.poiMaxMeters) === 0).length;
}

function buildRunPoiSearchText(poi: PointOfInterest): string {
  return [
    poi.name,
    poi.matchReason,
    poi.rawTags.type,
    poi.rawTags.typecode,
    ...poi.tags
  ]
    .filter(Boolean)
    .join(" ");
}

function isRunPoiUsable(poi: PointOfInterest): boolean {
  if (poi.terrains.some((terrain) => terrain === "track" || terrain === "park" || terrain === "waterfront")) {
    return true;
  }

  return /公园|绿道|步道|操场|跑道|运动场|体育场|体育中心|滨江|河道|健身步道|fitness_trail|sports_centre|stadium|pitch|recreation_ground|sport:running/u.test(
    buildRunPoiSearchText(poi)
  );
}

function withQualityTier(
  poi: PointOfInterest,
  qualityTier: "raw" | "usable" | "recommended"
): PointOfInterest {
  return {
    ...withPoiDescription(poi),
    qualityTier
  };
}

function buildRunCandidatePool(
  pois: readonly PointOfInterest[],
  profile: RunDistanceProfile
): PlanCandidatesDataPayload {
  const prioritized = prioritizeRunPoisByPreference(pois, profile);
  const usableIds = new Set(
    prioritized
      .filter((poi) => isRunPoiUsable(poi))
      .map((poi) => poi.id)
  );
  const usableCandidates = prioritized
    .filter((poi) => usableIds.has(poi.id))
    .map((poi) => withQualityTier(poi, "usable"));
  const recommendedSeed = usableCandidates.length > 0 ? usableCandidates : prioritized.map((poi) => withQualityTier(poi, "raw"));

  return {
    rawCandidates: prioritized.map((poi) => withQualityTier(poi, usableIds.has(poi.id) ? "usable" : "raw")),
    usableCandidates,
    recommendedCandidates: recommendedSeed.slice(0, 6).map((poi) => withQualityTier(poi, "recommended")),
    minimumSatisfied: usableCandidates.length >= profile.minUsableCandidates
  };
}

function buildRoutingCandidates(
  pool: PlanCandidatesDataPayload,
  profile: RunDistanceProfile
): PointOfInterest[] {
  const seen = new Set<string>();
  const ordered: PointOfInterest[] = [];
  const seed = pool.usableCandidates.length > 0
    ? [...pool.usableCandidates, ...pool.rawCandidates]
    : pool.rawCandidates;

  for (const poi of prioritizeRunPoisByPreference(seed, profile)) {
    const key = buildPoiKey(poi);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    ordered.push(poi);
  }

  return ordered;
}

function dedupeTextList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    const normalized = normalizeCopy(trimmed);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeRunAiRoutes(value: unknown): RunAiRoute[] {
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
      why: asTrimmedString(record.why)
    }];
  });
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asTrimmedString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeRunAiAnalysis(value: unknown): RunAiAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    reason: asTrimmedString(record.reason),
    routes: normalizeRunAiRoutes(record.routes),
    tips: normalizeStringList(record.tips)
  };
}

function pickRouteSlot(route: RoutedCandidate, scoredHours: ScoredHour[], framedWindow: TimeWindow, usedTimes: Set<string>): ScheduledRouteSlot {
  const framedEnd = timeToMinutes(framedWindow.to);
  const fittingHours = scoredHours.filter(({ hour }) => timeToMinutes(isoToTime(hour.time)) + Math.max(30, route.estTimeMin) <= framedEnd);
  const nextHour = fittingHours.find(({ hour }) => !usedTimes.has(isoToTime(hour.time)))
    ?? fittingHours[0]
    ?? scoredHours.find(({ hour }) => !usedTimes.has(isoToTime(hour.time)))
    ?? scoredHours[0];

  if (!nextHour) {
    return {
      recommendedTime: framedWindow.from,
      timeWindow: buildRouteTimeWindow(framedWindow.from, route.estTimeMin, framedWindow),
      hour: {
        time: `1970-01-01T${framedWindow.from}`,
        temperatureC: 20,
        apparentTemperatureC: 20,
        precipitationProbability: 0,
        uvIndex: 0,
        cloudCover: 20,
        windSpeedKmh: 8
      }
    };
  }

  const recommendedTime = isoToTime(nextHour.hour.time);
  usedTimes.add(recommendedTime);

  return {
    recommendedTime,
    timeWindow: buildRouteTimeWindow(recommendedTime, route.estTimeMin, framedWindow),
    hour: nextHour.hour
  };
}

async function loadRunPois(
  context: ScenarioPlannerContext,
  input: RunPlanRequest,
  profile: RunDistanceProfile
): Promise<PlanCandidatesDataPayload> {
  const radius = profile.searchRadiusMeters;
  logPlanExecution(
    "info",
    `按严格半径 ${radius} 米搜索跑步地点，并与 ${formatKilometers(profile.preferredMinKm)}-${formatKilometers(profile.preferredMaxKm)} km 目标里程分开处理`
  );

  const resolved = await context.poiProvider.searchRunPois(input.location, radius);
  const pool = buildRunCandidatePool(resolved, profile);
  const matchedCount = countMileageMatchedPois(pool.rawCandidates, profile);

  logPlanExecution(
    "info",
    `共获得 ${pool.rawCandidates.length} 个原始候选，其中 ${pool.usableCandidates.length} 个可直接用于跑步推荐，${matchedCount} 个更贴近当前里程偏好`
  );

  if (pool.rawCandidates.length < profile.minRawCandidates) {
    logPlanExecution("warn", `严格半径内原始候选仅 ${pool.rawCandidates.length} 个，前端将继续展示全部候选供 AI 或手动筛选`);
  }

  if (!pool.minimumSatisfied) {
    logPlanExecution("warn", `当前可用跑步 POI 仅 ${pool.usableCandidates.length} 个，未达到目标下限 ${profile.minUsableCandidates} 个`);
  }

  return pool;
}

function buildRunProcessSteps(context: ScenarioPlannerContext, routeCount?: number): PlanProcessStep[] {
  return [
    {
      id: RUN_STAGE_IDS.weather,
      title: "天气评估",
      detail: "正在帮你看天气预报，筛选出最适合出发的时间窗口",
      provider: context.weatherProvider.name,
      outcome: "success"
    },
    {
      id: RUN_STAGE_IDS.geocoding,
      title: "位置识别",
      detail: "根据当前坐标解析城市与区域",
      provider: context.geocodingProvider.name,
      outcome: "success"
    },
    {
      id: RUN_STAGE_IDS.poi,
      title: "跑步地点筛选",
      detail: "正按里程偏好寻找更适合的真实跑步地点",
      provider: context.poiProvider.name,
      outcome: "success"
    },
    {
      id: RUN_STAGE_IDS.routing,
      title: "路线测距",
      detail: routeCount === undefined
        ? "为候选地点计算步行往返距离与预计用时，并生成路线建议。"
        : `为候选地点计算步行往返距离与预计用时，最终生成 ${routeCount} 条路线建议。`,
      provider: context.routingProvider.name,
      outcome: "success"
    },
    {
      id: RUN_STAGE_IDS.ai,
      title: "综合推荐",
      detail: context.aiProvider
        ? "正在结合用户标签偏好分析真实候选路线，并生成最终推荐说明。"
        : "当前必须依赖 AI 生成最终推荐；若 AI 不可用，将停止返回模板化建议。",
      provider: context.aiProvider?.name,
      outcome: context.aiProvider ? "success" : "skipped"
    }
  ];
}

async function analyzeRunCandidates(
  context: ScenarioPlannerContext,
  input: RunPlanRequest,
  weatherData: {
    bestHour: HourlyWeatherPoint;
    framedWindow: TimeWindow;
    weatherLabel: string;
  },
  candidates: RoutedCandidate[]
): Promise<RunAiAnalysis | null> {
  try {
    const aiProvider = context.aiProvider;
    if (!aiProvider) {
      return null;
    }

    const response = await aiProvider.generateText({
      system: [
        "你是跑步路线分析师，需要根据用户偏好标签，从已经测距成功的真实候选路线中挑选并排序最多 3 条推荐路线。",
        "用户选择的 terrain 标签只用于分析与排序，不是 POI 获取约束。",
        "不得新增、删除或改写候选路线的名称、距离、预计时长、路线来源或标签。",
        "如果候选提供了 poiDescription，必须把它视为理解场景的核心事实来源，不要只根据地点名字和标签套模板。",
        "只能从给定候选 routes 中选择 name；如果偏好标签为空，就优先考虑完成度、路线多样性和稳妥性。",
        "总理由需要说明为何在给定天气窗口下，这组路线更贴近用户偏好。",
        "每条路线 why 只描述体验角度与偏好匹配，不要写具体时间、温度、降水、UV 数值，也不要和总理由重复。",
        "不同路线 why 不能只是替换名字后复用同一模板，至少要引用各自 poiDescription 中不同的场景信息。",
        "输出 JSON，字段仅包含 reason、routes、tips；routes 内仅包含 name 和 why。"
      ].join(""),
      user: JSON.stringify({
        preferences: {
          terrain: input.preferences?.terrain ?? [],
          preferredDistanceKm: input.preferences?.preferredDistanceKm,
          paceMinPerKm: input.preferences?.paceMinPerKm,
          avoidHighUv: input.preferences?.avoidHighUv ?? true
        },
        framedWindow: weatherData.framedWindow,
        bestTime: isoToTime(weatherData.bestHour.time),
        weatherSummary: weatherData.weatherLabel,
        routes: candidates.map((route) => ({
          name: route.poi.name,
          poiDescription: route.poi.description ?? describePointOfInterest(route.poi),
          distanceKm: route.distanceKm,
          estTimeMin: route.estTimeMin,
          tags: route.poi.terrains,
          routeSource: route.routeSource
        })),
      }),
      temperature: 0.45
    });

    const parsed = safeJsonParse<unknown>(extractJsonBlock(response));
    const normalized = normalizeRunAiAnalysis(parsed);
    if (!normalized) {
      logPlanExecution("warn", "AI 返回内容无法解析，将停止返回跑步推荐");
      return null;
    }

    return normalized;
  } catch (error) {
    logPlanExecution("warn", "AI 路线分析失败，将停止返回跑步推荐", toErrorMessage(error));
    return null;
  }
}

function orderRunCandidates(candidates: RoutedCandidate[], aiRoutes?: RunAiRoute[], limit = 3): RoutedCandidate[] {
  const byName = new Map(candidates.map((candidate) => [candidate.poi.name, candidate]));
  const ordered: RoutedCandidate[] = [];
  const seen = new Set<string>();

  for (const route of aiRoutes ?? []) {
    const matched = byName.get(route.name);
    if (!matched || seen.has(matched.poi.name)) {
      continue;
    }

    seen.add(matched.poi.name);
    ordered.push(matched);
    if (ordered.length >= limit) {
      return ordered;
    }
  }

  for (const candidate of candidates) {
    if (seen.has(candidate.poi.name)) {
      continue;
    }

    seen.add(candidate.poi.name);
    ordered.push(candidate);
    if (ordered.length >= limit) {
      break;
    }
  }

  return ordered;
}

function buildRunRoutes(
  candidates: RoutedCandidate[],
  weatherData: {
    scoredHours: ScoredHour[];
    framedWindow: TimeWindow;
  }
): RunRoute[] {
  const usedTimes = new Set<string>();

  return candidates.map((route) => {
    const slot = pickRouteSlot(route, weatherData.scoredHours, weatherData.framedWindow, usedTimes);

    return {
      name: route.poi.name,
      distanceKm: route.distanceKm,
      estTimeMin: route.estTimeMin,
      recommendedTime: slot.recommendedTime,
      timeWindow: slot.timeWindow,
      why: buildRouteWhy(route.poi, slot),
      tags: route.poi.terrains,
      navigationUrl: route.navigationUrl,
      routeSource: route.routeSource,
      poiCoordinates: route.poi.coordinates
    };
  });
}

function buildStrictRunRoutes(
  candidates: RoutedCandidate[],
  weatherData: {
    scoredHours: ScoredHour[];
    framedWindow: TimeWindow;
  },
  aiRoutes: RunAiRoute[]
): RunRoute[] | null {
  const usedTimes = new Set<string>();
  const byName = new Map(candidates.map((candidate) => [candidate.poi.name, candidate]));
  const usedNames = new Set<string>();
  const usedWhy = new Set<string>();
  const routes: RunRoute[] = [];

  for (const route of aiRoutes) {
    const matched = byName.get(route.name);
    const why = route.why?.trim();
    if (!matched || !why || usedNames.has(route.name)) {
      continue;
    }

    const normalizedWhy = normalizeCopy(why);
    if (!normalizedWhy || usedWhy.has(normalizedWhy)) {
      return null;
    }

    usedNames.add(route.name);
    usedWhy.add(normalizedWhy);

    const slot = pickRouteSlot(matched, weatherData.scoredHours, weatherData.framedWindow, usedTimes);
    routes.push({
      name: matched.poi.name,
      distanceKm: matched.distanceKm,
      estTimeMin: matched.estTimeMin,
      recommendedTime: slot.recommendedTime,
      timeWindow: slot.timeWindow,
      why,
      tags: matched.poi.terrains,
      navigationUrl: matched.navigationUrl,
      routeSource: matched.routeSource,
      poiCoordinates: matched.poi.coordinates
    });

    if (routes.length >= 3) {
      break;
    }
  }

  return routes.length > 0 ? routes : null;
}

export const runTomorrowScenario: ScenarioDefinition<typeof runPlanRequestSchema, typeof runPlanSchema> = {
  id: "run_tomorrow",
  manifest: manifest(),
  inputSchema: runPlanRequestSchema,
  outputSchema: runPlanSchema,
  getExecutionStages(context) {
    return buildRunProcessSteps(context);
  },
  async plan(context, input) {
    const distanceProfile = buildRunDistanceProfile(input);
    const [weatherData, place, poiPool] = await Promise.all([
      withExecutionStage(RUN_STAGE_IDS.weather, async () => {
        logPlanExecution("info", "开始拉取未来 7 天的逐小时天气数据");
        const forecast = await context.weatherProvider.getForecast(input.location, input.timezone, 7);
        logPlanExecution("info", `天气数据拉取完成：${forecast.daily.length} 天、${forecast.hourly.length} 条逐小时记录`);

        const tomorrow = getTomorrowDate(input.timezone);
        const targetDay = forecast.daily.find((item) => item.date === tomorrow) ?? forecast.daily[0];
        if (!targetDay) {
          logPlanExecution("error", "天气服务未返回可用于明天规划的数据");
          throw new AppError("天气服务未返回明天的天气数据", 502);
        }

        const framedWindow = normalizeTimeWindow(input.preferences?.startWindow);
        const scoredHours = forecast.hourly
          .filter((hour) => hour.time.startsWith(targetDay.date))
          .filter((hour) => {
            const time = isoToTime(hour.time);
            return time >= framedWindow.from && time <= framedWindow.to;
          })
          .map((hour) => ({
            hour,
            score: scoreRunHour(hour) - ((input.preferences?.avoidHighUv ?? true) ? hour.uvIndex * 4 : 0)
          }))
          .sort((left, right) => right.score - left.score);

        logPlanExecution("info", `天气评估阶段在 ${framedWindow.from}-${framedWindow.to} 内筛出 ${scoredHours.length} 个可跑步时间点`);

        const bestHour = scoredHours[0]?.hour;
        if (!bestHour) {
          logPlanExecution("error", "当前天气和偏好条件下未能推导出合适的跑步时间窗口");
          throw new AppError("未能推导出适合跑步的时间窗口，请调整偏好后重试。", 400);
        }

        const weatherLabel = summarizeDailyWeather(targetDay);
        logPlanExecution("info", `最佳时段评估完成：${isoToTime(bestHour.time)}，天气 ${weatherLabel}`);
        
        emitPlanData("weather", { label: weatherLabel });

        return {
          forecast,
          targetDay,
          bestHour,
          framedWindow,
          scoredHours,
          weatherLabel
        };
      }),
      withExecutionStage(RUN_STAGE_IDS.geocoding, async () => {
        logPlanExecution("info", "开始解析当前位置名称");
        const resolvedPlace = await context.geocodingProvider.reverseGeocode(input.location);
        logPlanExecution("info", `位置解析完成：${resolvedPlace.displayName}`);
        return resolvedPlace;
      }),
      withExecutionStage(RUN_STAGE_IDS.poi, async () => {
        logPlanExecution("info", "开始搜索周边真实跑步地点");
        const resolvedPois = await loadRunPois(context, input, distanceProfile);
        logPlanExecution(
          "info",
          `地点筛选完成：共获得 ${resolvedPois.rawCandidates.length} 个候选 POI，其中 ${resolvedPois.usableCandidates.length} 个可直接用于跑步推荐`
        );
        
        emitPlanData("candidates", resolvedPois);

        return resolvedPois;
      })
    ]);

    if (poiPool.rawCandidates.length === 0) {
      logPlanExecution("error", "附近未找到可用于跑步推荐的真实 POI", undefined, RUN_STAGE_IDS.poi);
      throw new AppError("当前位置附近暂未找到可用于跑步推荐的真实 POI，请尝试更换位置后重试。", 404);
    }

    const paceMinPerKm = input.preferences?.paceMinPerKm ?? 6.5;
    const routedCandidates = await withExecutionStage(RUN_STAGE_IDS.routing, async () => {
      const candidatePois = buildRoutingCandidates(poiPool, distanceProfile).slice(0, 10);
      logPlanExecution("info", `开始为 ${candidatePois.length} 个候选地点计算步行往返路线，优先使用 usableCandidates`);

      const routeCandidates = await Promise.all(
        candidatePois.map(async (poi) => {
          try {
            const route = await context.routingProvider.getWalkingRoute(input.location, poi.coordinates);
            const distanceKm = Number(((route.distanceMeters * 2) / 1000).toFixed(1));
            const estTimeMin = Math.max(15, Math.round(distanceKm * paceMinPerKm));
            const distanceScore = 100 - Math.abs(distanceKm - distanceProfile.preferredCenterKm) * 16;

            logPlanExecution("info", `路线测距成功：${poi.name}，往返约 ${distanceKm} km，预计 ${estTimeMin} 分钟`);

            return {
              poi,
              distanceKm,
              estTimeMin,
              navigationUrl: context.navigationProvider.buildNavigationUrl(poi.coordinates, poi.name),
              routeSource: route.source,
              score: distanceScore - poi.distanceMeters / 700
            };
          } catch (error) {
            logPlanExecution("warn", `路线测距失败：${poi.name}`, toErrorMessage(error));
            return null;
          }
        })
      );

      const successfulRoutes = routeCandidates.filter((item): item is NonNullable<typeof item> => item !== null);
      logPlanExecution("info", `路线测距结束：${successfulRoutes.length}/${candidatePois.length} 个候选地点成功返回路径`);

      const routes = successfulRoutes
        .filter((item) => item.distanceKm >= distanceProfile.routeFilterMinKm && item.distanceKm <= distanceProfile.routeFilterMaxKm)
        .sort((left, right) => right.score - left.score)
        .slice(0, 6)
        .map<RoutedCandidate>((item) => ({
          poi: item.poi,
          distanceKm: item.distanceKm,
          estTimeMin: item.estTimeMin,
          navigationUrl: item.navigationUrl,
          routeSource: item.routeSource
        }));

      if (routes.length === 0) {
        if (successfulRoutes.length === 0) {
          logPlanExecution("error", "所有候选地点的路线测距都失败了");
          throw new AppError("路径服务当前较繁忙，请稍后重试。", 503);
        }

        logPlanExecution("error", "已有测距结果，但都不符合当前里程偏好");
        throw new AppError("附近真实路线与当前里程偏好不匹配，请放宽距离后重试。", 404);
      }

      logPlanExecution("info", `路线筛选完成：保留 ${routes.length} 条真实候选路线供最终推荐`);
      return routes;
    });

    const selectedRoutes = buildRunRoutes(routedCandidates.slice(0, 3), weatherData);

    const bestTime = isoToTime(weatherData.bestHour.time);
    const basePlan: RunPlan = {
      type: "run_tomorrow",
      city: place.city,
      targetDate: weatherData.targetDay.date,
      weatherSummary: weatherData.weatherLabel,
      bestTime,
      framedWindow: weatherData.framedWindow,
      reason: buildWeatherReason(weatherData.bestHour, weatherData.framedWindow),
      routes: selectedRoutes,
      tips: buildTips(
        bestTime,
        weatherData.framedWindow,
        weatherData.targetDay.temperatureMaxC,
        weatherData.targetDay.precipitationProbabilityMax,
        weatherData.targetDay.uvIndexMax
      ),
      meta: {
        weatherProvider: context.weatherProvider.name,
        poiProvider: context.poiProvider.name,
        routingProvider: context.routingProvider.name,
        aiEnhanced: false,
        process: buildRunProcessSteps(context, selectedRoutes.length)
      }
    };

    if (!context.aiProvider) {
      logPlanExecution("error", "未启用 AI 综合分析，停止返回模板化跑步建议", undefined, RUN_STAGE_IDS.ai);
      throw new AppError(RUN_AI_REQUIRED_ERROR, 503);
    }

    return await withExecutionStage(RUN_STAGE_IDS.ai, async () => {
      logPlanExecution("info", "开始执行 AI 路线分析与偏好对齐");
      const aiAnalysis = await analyzeRunCandidates(context, input, weatherData, routedCandidates);
      if (!aiAnalysis) {
        logPlanExecution("error", "AI 未产出可用分析结果，停止返回模板化跑步结果");
        throw new AppError(RUN_AI_REQUIRED_ERROR, 503);
      }

      const reason = aiAnalysis.reason?.trim();
      const aiOrderedCandidates = orderRunCandidates(routedCandidates, aiAnalysis.routes);
      const aiRoutes = buildStrictRunRoutes(aiOrderedCandidates, weatherData, aiAnalysis.routes);
      const aiTips = dedupeTextList(aiAnalysis.tips).slice(0, 4);
      if (!reason || aiTips.length === 0 || !aiRoutes) {
        logPlanExecution("error", "AI 跑步建议未提供完整且不重复的推荐文案");
        throw new AppError(RUN_AI_REQUIRED_ERROR, 503);
      }

      const enhanced: RunPlan = {
        ...basePlan,
        reason,
        routes: aiRoutes,
        tips: aiTips,
        meta: {
          ...basePlan.meta,
          aiEnhanced: true,
          process: buildRunProcessSteps(context, aiRoutes.length)
        }
      };

      logPlanExecution("info", "AI 路线分析完成");
      return enhanced;
    });
  }
};
