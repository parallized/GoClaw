import {
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
import { logPlanExecution, markExecutionStage, withExecutionStage } from "../../lib/plan-execution";
import { scoreRunHour, summarizeDailyWeather } from "../../lib/weather";

const RUN_STAGE_IDS = {
  weather: "run.weather",
  geocoding: "run.geocoding",
  poi: "run.poi",
  routing: "run.routing",
  ai: "run.ai"
} as const;

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

type RunDistanceProfile = {
  preferredMinKm: number;
  preferredMaxKm: number;
  preferredCenterKm: number;
  routeFilterMinKm: number;
  routeFilterMaxKm: number;
  poiMinMeters: number;
  poiMaxMeters: number;
  poiTargetMeters: number;
  searchRadii: number[];
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
  return `${buildRouteSummary(poi)}，建议 ${slot.recommendedTime} 出发，在 ${slot.timeWindow.from}-${slot.timeWindow.to} 完成；这个时段体感 ${slot.hour.apparentTemperatureC.toFixed(0)}℃、降水 ${slot.hour.precipitationProbability.toFixed(0)}%、UV ${slot.hour.uvIndex.toFixed(1)}。`;
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
  return Math.min(maxRadius, Math.max(2_500, Math.round(radiusMeters / 100) * 100));
}

function buildRunDistanceProfile(input: RunPlanRequest): RunDistanceProfile {
  const preferredMinKm = input.preferences?.preferredDistanceKm?.min ?? 4;
  const preferredMaxKm = input.preferences?.preferredDistanceKm?.max ?? 8;
  const preferredCenterKm = (preferredMinKm + preferredMaxKm) / 2;
  const oneWayMinMeters = preferredMinKm * 500;
  const oneWayMaxMeters = preferredMaxKm * 500;
  const poiMinMeters = Math.max(500, Math.round(oneWayMinMeters * 0.75));
  const poiMaxMeters = Math.max(poiMinMeters + 500, Math.round(oneWayMaxMeters * 1.1));
  const baseRadius = clampSearchRadius(poiMaxMeters + 1_500, 11_000);
  const expandedRadius = clampSearchRadius(Math.max(baseRadius + 2_500, poiMaxMeters + 3_500), 13_000);
  const fallbackRadius = clampSearchRadius(Math.max(expandedRadius + 2_000, poiMaxMeters + 5_500));

  return {
    preferredMinKm,
    preferredMaxKm,
    preferredCenterKm,
    routeFilterMinKm: Math.max(1.5, preferredMinKm * 0.7),
    routeFilterMaxKm: preferredMaxKm * 1.5,
    poiMinMeters,
    poiMaxMeters,
    poiTargetMeters: Math.round((poiMinMeters + poiMaxMeters) / 2),
    searchRadii: [...new Set([baseRadius, expandedRadius, fallbackRadius])]
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
  return `${poi.id}:${normalizeCopy(poi.name)}:${poi.coordinates.latitude.toFixed(5)}:${poi.coordinates.longitude.toFixed(5)}`;
}

function countTerrainMatches(poi: PointOfInterest, preferredTerrains: ReadonlySet<string>): number {
  if (preferredTerrains.size === 0) {
    return 0;
  }

  return poi.terrains.filter((terrain) => preferredTerrains.has(terrain)).length;
}

function comparePoisByPreference(
  left: PointOfInterest,
  right: PointOfInterest,
  profile: RunDistanceProfile,
  preferredTerrains: ReadonlySet<string>
): number {
  const leftBandGap = distanceToRange(left.distanceMeters, profile.poiMinMeters, profile.poiMaxMeters);
  const rightBandGap = distanceToRange(right.distanceMeters, profile.poiMinMeters, profile.poiMaxMeters);
  if (leftBandGap !== rightBandGap) {
    return leftBandGap - rightBandGap;
  }

  const leftTerrainMatches = countTerrainMatches(left, preferredTerrains);
  const rightTerrainMatches = countTerrainMatches(right, preferredTerrains);
  if (leftTerrainMatches !== rightTerrainMatches) {
    return rightTerrainMatches - leftTerrainMatches;
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
  profile: RunDistanceProfile,
  preferredTerrains: ReadonlySet<string>
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

  return deduped.sort((left, right) => comparePoisByPreference(left, right, profile, preferredTerrains));
}

function countMileageMatchedPois(pois: readonly PointOfInterest[], profile: RunDistanceProfile): number {
  return pois.filter((poi) => distanceToRange(poi.distanceMeters, profile.poiMinMeters, profile.poiMaxMeters) === 0).length;
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

function chooseDistinctCopy(candidate: string | undefined, fallback: string, used: Set<string>): string {
  const trimmed = candidate?.trim();
  if (!trimmed) {
    used.add(normalizeCopy(fallback));
    return fallback;
  }

  const normalized = normalizeCopy(trimmed);
  if (!normalized || normalized.length < 8 || used.has(normalized)) {
    used.add(normalizeCopy(fallback));
    return fallback;
  }

  used.add(normalized);
  return trimmed;
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
  profile: RunDistanceProfile,
  preferredTerrains: ReadonlySet<string>
): Promise<PointOfInterest[]> {
  let ranked: PointOfInterest[] = [];

  for (const [index, radius] of profile.searchRadii.entries()) {
    try {
      if (index === 0) {
        logPlanExecution(
          "info",
          `按里程偏好 ${formatKilometers(profile.preferredMinKm)}-${formatKilometers(profile.preferredMaxKm)} km 搜索约 ${radius} 米范围内的跑步地点`
        );
      } else {
        logPlanExecution(
          "info",
          `当前候选与 ${formatKilometers(profile.preferredMinKm)}-${formatKilometers(profile.preferredMaxKm)} km 里程偏好的匹配不足，扩展到 ${radius} 米继续搜索`
        );
      }

      const resolved = await context.poiProvider.searchRunPois(input.location, radius);
      ranked = prioritizeRunPoisByPreference([...ranked, ...resolved], profile, preferredTerrains);

      const matchedCount = countMileageMatchedPois(ranked, profile);
      logPlanExecution("info", `累计获得 ${ranked.length} 个候选地点，其中 ${matchedCount} 个更贴近当前里程偏好`);

      if (matchedCount >= 3 || (matchedCount > 0 && ranked.length >= 10)) {
        return ranked;
      }
    } catch (error) {
      if (index === 0) {
        throw error;
      }

      logPlanExecution("warn", "扩圈搜索失败，回退为上一轮已获得的跑步地点结果", toErrorMessage(error));
      return ranked;
    }
  }

  return ranked;
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
        ? "正在根据已确定的时间窗口和路线事实做轻量文案优化"
        : "当前未启用 AI 润色，直接返回基于真实数据生成的确定性结果。",
      provider: context.aiProvider?.name,
      outcome: context.aiProvider ? "success" : "skipped"
    }
  ];
}

async function enhancePlan(context: ScenarioPlannerContext, plan: RunPlan): Promise<RunPlan> {
  if (!context.aiProvider) {
    return plan;
  }

  try {
    const response = await context.aiProvider.generateText({
      system: [
        "你是跑步规划编辑，只负责轻量润色已有事实。",
        "不得新增、删除或改写地点、推荐时间、时间段、天气数值、路线距离、路线来源或标签。",
        "总理由需要说明为何在给定时间框内选择这个出发点。",
        "每条路线 why 必须保留自身角度，结合该路线的推荐时间与时间段，不能复述总理由，也不要让不同路线句式雷同。",
        "输出 JSON，字段仅包含 reason、routes、tips；routes 内仅包含 name 和 why。"
      ].join(""),
      user: JSON.stringify({
        framedWindow: plan.framedWindow,
        bestTime: plan.bestTime,
        weatherSummary: plan.weatherSummary,
        reason: plan.reason,
        routes: plan.routes.map((route) => ({
          name: route.name,
          recommendedTime: route.recommendedTime,
          timeWindow: route.timeWindow,
          why: route.why,
          tags: route.tags
        })),
        tips: plan.tips
      }),
      temperature: 0.35
    });

    const parsed = safeJsonParse<{ reason?: string; routes?: Array<{ name: string; why?: string }>; tips?: string[] }>(extractJsonBlock(response));
    if (!parsed) {
      logPlanExecution("warn", "AI 返回内容无法解析，保留原始跑步文案");
      return plan;
    }

    const usedCopies = new Set<string>();
    const reason = chooseDistinctCopy(parsed.reason, plan.reason, usedCopies);
    const routes = plan.routes.map((route) => {
      const aiWhy = parsed.routes?.find((item) => item.name === route.name)?.why;
      return {
        ...route,
        why: chooseDistinctCopy(aiWhy, route.why, usedCopies)
      };
    });
    const tips = dedupeTextList(parsed.tips?.filter(Boolean) ?? plan.tips).slice(0, 4);

    const changed = reason !== plan.reason
      || routes.some((route, index) => route.why !== plan.routes[index]?.why)
      || tips.length !== plan.tips.length
      || tips.some((tip, index) => tip !== plan.tips[index]);

    if (!changed) {
      return plan;
    }

    return {
      ...plan,
      reason,
      routes,
      tips: tips.length > 0 ? tips : plan.tips,
      meta: {
        ...plan.meta,
        aiEnhanced: true
      }
    };
  } catch (error) {
    logPlanExecution("warn", "AI 润色失败，保留原始跑步文案", toErrorMessage(error));
    return plan;
  }
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
    const preferredTerrains = new Set(input.preferences?.terrain ?? []);
    const [weatherData, place, pois] = await Promise.all([
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
        const resolvedPois = await loadRunPois(context, input, distanceProfile, preferredTerrains);
        logPlanExecution("info", `地点筛选完成：共获得 ${resolvedPois.length} 个候选 POI`);
        return resolvedPois;
      })
    ]);

    if (pois.length === 0) {
      logPlanExecution("error", "附近未找到可用于跑步推荐的真实 POI", undefined, RUN_STAGE_IDS.poi);
      throw new AppError("当前位置附近暂未找到可用于跑步推荐的真实 POI，请尝试更换位置后重试。", 404);
    }

    const paceMinPerKm = input.preferences?.paceMinPerKm ?? 6.5;
    const routedCandidates = await withExecutionStage(RUN_STAGE_IDS.routing, async () => {
      const candidatePois = prioritizeRunPoisByPreference(pois, distanceProfile, preferredTerrains).slice(0, 10);
      logPlanExecution("info", `开始为 ${candidatePois.length} 个更贴近里程偏好的候选地点计算步行往返路线`);

      const routeCandidates = await Promise.all(
        candidatePois.map(async (poi) => {
          try {
            const route = await context.routingProvider.getWalkingRoute(input.location, poi.coordinates);
            const distanceKm = Number(((route.distanceMeters * 2) / 1000).toFixed(1));
            const estTimeMin = Math.max(15, Math.round(distanceKm * paceMinPerKm));
            const distanceScore = 100 - Math.abs(distanceKm - distanceProfile.preferredCenterKm) * 16;
            const terrainScore = preferredTerrains.size === 0
              ? 0
              : poi.terrains.filter((terrain) => preferredTerrains.has(terrain)).length * 12;

            logPlanExecution("info", `路线测距成功：${poi.name}，往返约 ${distanceKm} km，预计 ${estTimeMin} 分钟`);

            return {
              poi,
              distanceKm,
              estTimeMin,
              navigationUrl: context.navigationProvider.buildNavigationUrl(poi.coordinates, poi.name),
              routeSource: route.source,
              score: distanceScore + terrainScore - poi.distanceMeters / 700
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
        .slice(0, 3)
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

      logPlanExecution("info", `路线筛选完成：最终保留 ${routes.length} 条建议`);
      return routes;
    });

    const usedTimes = new Set<string>();
    const selectedRoutes: RunRoute[] = routedCandidates.map((route) => {
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
      markExecutionStage(RUN_STAGE_IDS.ai, "skipped");
      logPlanExecution("info", "未启用 AI 润色，直接返回基于真实数据的结果", undefined, RUN_STAGE_IDS.ai);
      return basePlan;
    }

    return await withExecutionStage(RUN_STAGE_IDS.ai, async () => {
      logPlanExecution("info", "开始执行 AI 文案润色");
      const enhanced = await enhancePlan(context, basePlan);
      logPlanExecution(
        "info",
        enhanced.meta.aiEnhanced ? "AI 文案润色完成" : "AI 未产出可用结果，已保留原始文案"
      );
      return enhanced;
    });
  }
};
