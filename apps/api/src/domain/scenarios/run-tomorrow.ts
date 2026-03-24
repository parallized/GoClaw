import {
  runPlanRequestSchema,
  runPlanSchema,
  scenarioCatalog,
  type PlanProcessStep,
  type RunPlan,
  type RunPlanRequest
} from "@goplan/contracts";
import type { PointOfInterest } from "../service-types";
import type { ScenarioDefinition, ScenarioPlannerContext } from "../scenario-definition";
import { extractJsonBlock, safeJsonParse } from "../../lib/json-parser";
import { AppError } from "../../lib/errors";
import { scoreRunHour, summarizeDailyWeather } from "../../lib/weather";

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

function buildWeatherReason(hour: { temperatureC: number; precipitationProbability: number; uvIndex: number }): string {
  return `体感 ${hour.temperatureC.toFixed(0)}℃、降水 ${hour.precipitationProbability.toFixed(0)}%、UV ${hour.uvIndex.toFixed(1)}，综合舒适度最佳。`;
}

function buildRouteWhy(poi: PointOfInterest, weatherLabel: string): string {
  const summary = poi.terrains.includes("shaded")
    ? "树荫覆盖更友好"
    : poi.terrains.includes("track")
      ? "路线节奏稳定、适合控配速"
      : poi.terrains.includes("waterfront")
        ? "沿水体更通风"
        : "整体路况较平稳";

  return `${summary}，并且 ${weatherLabel} 时段更适合这条路线。`;
}

function buildTips(bestTime: string, temperatureMaxC: number, precipitationProbabilityMax: number, uvMax: number): string[] {
  const tips = [`建议在 ${bestTime} 前后 15 分钟完成热身后再起跑。`];

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

async function loadRunPois(context: ScenarioPlannerContext, input: RunPlanRequest): Promise<PointOfInterest[]> {
  const maxDistanceKm = input.preferences?.preferredDistanceKm?.max ?? 8;
  const primaryRadius = Math.min(9000, Math.max(2500, Math.round(maxDistanceKm * 750)));
  const primary = await context.poiProvider.searchRunPois(input.location, primaryRadius);
  if (primary.length >= 3) {
    return primary;
  }

  try {
    return await context.poiProvider.searchRunPois(input.location, Math.min(primaryRadius + 4000, 15000));
  } catch {
    return primary;
  }
}

function buildRunProcessSteps(context: ScenarioPlannerContext, routeCount: number): PlanProcessStep[] {
  return [
    {
      title: "天气评估",
      detail: "拉取未来 7 天逐小时天气，筛选出明天最适合出发的时间窗口。",
      provider: context.weatherProvider.name,
      outcome: "success"
    },
    {
      title: "位置识别",
      detail: "根据当前坐标解析城市与区域，用于结果命名和地点提示。",
      provider: context.geocodingProvider.name,
      outcome: "success"
    },
    {
      title: "跑步地点筛选",
      detail: "基于真实 POI 搜索周边公园、绿道和跑道，并按距离与地形做候选排序。",
      provider: context.poiProvider.name,
      outcome: "success"
    },
    {
      title: "路线测距",
      detail: `为候选地点计算步行往返距离与预计用时，最终生成 ${routeCount} 条路线建议。`,
      provider: context.routingProvider.name,
      outcome: "success"
    },
    {
      title: "文案润色",
      detail: context.aiProvider
        ? "在不新增事实的前提下，对推荐理由和注意事项做轻量润色。"
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
      system: "你是专业跑步规划编辑。你只能润色现有事实，不得新增地点、数值、天气或路线。输出 JSON，字段仅包含 reason、routes、tips。",
      user: JSON.stringify({
        reason: plan.reason,
        routes: plan.routes.map((route) => ({ name: route.name, why: route.why })),
        tips: plan.tips
      }),
      temperature: 0.35
    });

    const parsed = safeJsonParse<{ reason?: string; routes?: Array<{ name: string; why?: string }>; tips?: string[] }>(extractJsonBlock(response));
    if (!parsed) {
      return plan;
    }

    return {
      ...plan,
      reason: parsed.reason?.trim() || plan.reason,
      routes: plan.routes.map((route) => ({
        ...route,
        why: parsed.routes?.find((item) => item.name === route.name)?.why?.trim() || route.why
      })),
      tips: parsed.tips?.filter(Boolean).slice(0, 4) ?? plan.tips,
      meta: {
        ...plan.meta,
        aiEnhanced: true
      }
    };
  } catch {
    return plan;
  }
}

export const runTomorrowScenario: ScenarioDefinition<typeof runPlanRequestSchema, typeof runPlanSchema> = {
  id: "run_tomorrow",
  manifest: manifest(),
  inputSchema: runPlanRequestSchema,
  outputSchema: runPlanSchema,
  async plan(context, input) {
    const [forecast, place, pois] = await Promise.all([
      context.weatherProvider.getForecast(input.location, input.timezone, 7),
      context.geocodingProvider.reverseGeocode(input.location),
      loadRunPois(context, input)
    ]);

    if (pois.length === 0) {
      throw new AppError("当前位置附近暂未找到可用于跑步推荐的真实 POI，请尝试更换位置后重试。", 404);
    }

    const tomorrow = getTomorrowDate(input.timezone);
    const targetDay = forecast.daily.find((item) => item.date === tomorrow) ?? forecast.daily[0];
    if (!targetDay) {
      throw new AppError("天气服务未返回明天的天气数据", 502);
    }

    const candidateHours = forecast.hourly
      .filter((hour) => hour.time.startsWith(targetDay.date))
      .filter((hour) => {
        const time = hour.time.split("T")[1] ?? "00:00";
        if (time < "05:00" || time > "21:00") {
          return false;
        }

        const startWindow = input.preferences?.startWindow;
        return startWindow ? time >= startWindow.from && time <= startWindow.to : true;
      });

    const bestHour = candidateHours
      .map((hour) => ({
        hour,
        score: scoreRunHour(hour) - ((input.preferences?.avoidHighUv ?? true) ? hour.uvIndex * 4 : 0)
      }))
      .sort((left, right) => right.score - left.score)[0]?.hour;

    if (!bestHour) {
      throw new AppError("未能推导出适合跑步的时间窗口，请调整偏好后重试。", 400);
    }

    const preferredMin = input.preferences?.preferredDistanceKm?.min ?? 4;
    const preferredMax = input.preferences?.preferredDistanceKm?.max ?? 8;
    const preferredCenter = (preferredMin + preferredMax) / 2;
    const paceMinPerKm = input.preferences?.paceMinPerKm ?? 6.5;
    const preferredTerrains = new Set(input.preferences?.terrain ?? []);
    const weatherLabel = summarizeDailyWeather(targetDay);

    const routeCandidates = await Promise.all(
      pois.slice(0, 10).map(async (poi) => {
        try {
          const route = await context.routingProvider.getWalkingRoute(input.location, poi.coordinates);
          const distanceKm = Number(((route.distanceMeters * 2) / 1000).toFixed(1));
          const estTimeMin = Math.max(15, Math.round(distanceKm * paceMinPerKm));
          const distanceScore = 100 - Math.abs(distanceKm - preferredCenter) * 16;
          const terrainScore = preferredTerrains.size === 0
            ? 0
            : poi.terrains.filter((terrain) => preferredTerrains.has(terrain)).length * 12;

          return {
            poi,
            route,
            distanceKm,
            estTimeMin,
            score: distanceScore + terrainScore - poi.distanceMeters / 700
          };
        } catch {
          return null;
        }
      })
    );

    const successfulRoutes = routeCandidates.filter((item): item is NonNullable<typeof item> => item !== null);

    const selectedRoutes = successfulRoutes
      .filter((item) => item.distanceKm >= Math.max(1.5, preferredMin * 0.7) && item.distanceKm <= preferredMax * 1.5)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3)
      .map((item) => ({
        name: item.poi.name,
        distanceKm: item.distanceKm,
        estTimeMin: item.estTimeMin,
        why: buildRouteWhy(item.poi, weatherLabel),
        tags: item.poi.terrains,
        navigationUrl: context.navigationProvider.buildNavigationUrl(item.poi.coordinates, item.poi.name),
        routeSource: item.route.source,
        poiCoordinates: item.poi.coordinates
      }));

    if (selectedRoutes.length === 0) {
      if (successfulRoutes.length === 0) {
        throw new AppError("路径服务当前较繁忙，请稍后重试。", 503);
      }

      throw new AppError("附近真实路线与当前里程偏好不匹配，请放宽距离后重试。", 404);
    }

    const basePlan: RunPlan = {
      type: "run_tomorrow",
      city: place.city,
      targetDate: targetDay.date,
      weatherSummary: weatherLabel,
      bestTime: bestHour.time.split("T")[1] ?? "07:00",
      reason: buildWeatherReason(bestHour),
      routes: selectedRoutes,
      tips: buildTips(bestHour.time.split("T")[1] ?? "07:00", targetDay.temperatureMaxC, targetDay.precipitationProbabilityMax, targetDay.uvIndexMax),
      meta: {
        weatherProvider: context.weatherProvider.name,
        poiProvider: context.poiProvider.name,
        routingProvider: context.routingProvider.name,
        aiEnhanced: false,
        process: buildRunProcessSteps(context, selectedRoutes.length)
      }
    };

    return enhancePlan(context, basePlan);
  }
};
