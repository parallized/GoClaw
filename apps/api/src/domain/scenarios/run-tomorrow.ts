import {
  runPlanRequestSchema,
  runPlanSchema,
  scenarioCatalog,
  type PlanProcessStep,
  type RunPlan,
  type RunPlanRequest
} from "@goclaw/contracts";
import type { PointOfInterest } from "../service-types";
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
  logPlanExecution("info", `按 ${primaryRadius} 米半径搜索跑步地点候选`);
  const primary = await context.poiProvider.searchRunPois(input.location, primaryRadius);
  if (primary.length >= 3) {
    logPlanExecution("info", `首轮搜索已获得 ${primary.length} 个候选地点`);
    return primary;
  }

  try {
    const expandedRadius = Math.min(primaryRadius + 4000, 15000);
    logPlanExecution("warn", `首轮候选仅 ${primary.length} 个，扩展到 ${expandedRadius} 米继续搜索`);
    const expanded = await context.poiProvider.searchRunPois(input.location, expandedRadius);
    logPlanExecution("info", `扩圈搜索后共获得 ${expanded.length} 个候选地点`);
    return expanded;
  } catch (error) {
    logPlanExecution("warn", "扩圈搜索失败，回退为首轮跑步地点结果", toErrorMessage(error));
    return primary;
  }
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
      detail: "正为你寻找周边游玩位置和路线",
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
        ? "正在根据你的偏好，对推荐路线做轻量优化"
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
      system: "你是跑步规划编辑。根据用户选择合适的地点，不得新增地点、数值、天气或路线。输出 JSON，字段仅包含 reason、routes、tips。",
      user: JSON.stringify({
        reason: plan.reason,
        routes: plan.routes.map((route) => ({ name: route.name, why: route.why })),
        tips: plan.tips
      }),
      temperature: 0.35
    });

    const parsed = safeJsonParse<{ reason?: string; routes?: Array<{ name: string; why?: string }>; tips?: string[] }>(extractJsonBlock(response));
    if (!parsed) {
      logPlanExecution("warn", "AI 返回内容无法解析，保留原始跑步文案");
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

        logPlanExecution("info", `天气评估阶段筛出 ${candidateHours.length} 个可跑步时间点`);

        const bestHour = candidateHours
          .map((hour) => ({
            hour,
            score: scoreRunHour(hour) - ((input.preferences?.avoidHighUv ?? true) ? hour.uvIndex * 4 : 0)
          }))
          .sort((left, right) => right.score - left.score)[0]?.hour;

        if (!bestHour) {
          logPlanExecution("error", "当前天气和偏好条件下未能推导出合适的跑步时间窗口");
          throw new AppError("未能推导出适合跑步的时间窗口，请调整偏好后重试。", 400);
        }

        const weatherLabel = summarizeDailyWeather(targetDay);
        logPlanExecution("info", `最佳时段评估完成：${bestHour.time.split("T")[1] ?? "07:00"}，天气 ${weatherLabel}`);

        return {
          forecast,
          targetDay,
          bestHour,
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
        const resolvedPois = await loadRunPois(context, input);
        logPlanExecution("info", `地点筛选完成：共获得 ${resolvedPois.length} 个候选 POI`);
        return resolvedPois;
      })
    ]);

    if (pois.length === 0) {
      logPlanExecution("error", "附近未找到可用于跑步推荐的真实 POI", undefined, RUN_STAGE_IDS.poi);
      throw new AppError("当前位置附近暂未找到可用于跑步推荐的真实 POI，请尝试更换位置后重试。", 404);
    }

    const preferredMin = input.preferences?.preferredDistanceKm?.min ?? 4;
    const preferredMax = input.preferences?.preferredDistanceKm?.max ?? 8;
    const preferredCenter = (preferredMin + preferredMax) / 2;
    const paceMinPerKm = input.preferences?.paceMinPerKm ?? 6.5;
    const preferredTerrains = new Set(input.preferences?.terrain ?? []);
    const selectedRoutes = await withExecutionStage(RUN_STAGE_IDS.routing, async () => {
      const candidatePois = pois.slice(0, 10);
      logPlanExecution("info", `开始为 ${candidatePois.length} 个候选地点计算步行往返路线`);

      const routeCandidates = await Promise.all(
        candidatePois.map(async (poi) => {
          try {
            const route = await context.routingProvider.getWalkingRoute(input.location, poi.coordinates);
            const distanceKm = Number(((route.distanceMeters * 2) / 1000).toFixed(1));
            const estTimeMin = Math.max(15, Math.round(distanceKm * paceMinPerKm));
            const distanceScore = 100 - Math.abs(distanceKm - preferredCenter) * 16;
            const terrainScore = preferredTerrains.size === 0
              ? 0
              : poi.terrains.filter((terrain) => preferredTerrains.has(terrain)).length * 12;

            logPlanExecution("info", `路线测距成功：${poi.name}，往返约 ${distanceKm} km，预计 ${estTimeMin} 分钟`);

            return {
              poi,
              route,
              distanceKm,
              estTimeMin,
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
        .filter((item) => item.distanceKm >= Math.max(1.5, preferredMin * 0.7) && item.distanceKm <= preferredMax * 1.5)
        .sort((left, right) => right.score - left.score)
        .slice(0, 3)
        .map((item) => ({
          name: item.poi.name,
          distanceKm: item.distanceKm,
          estTimeMin: item.estTimeMin,
          why: buildRouteWhy(item.poi, weatherData.weatherLabel),
          tags: item.poi.terrains,
          navigationUrl: context.navigationProvider.buildNavigationUrl(item.poi.coordinates, item.poi.name),
          routeSource: item.route.source,
          poiCoordinates: item.poi.coordinates
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

    const basePlan: RunPlan = {
      type: "run_tomorrow",
      city: place.city,
      targetDate: weatherData.targetDay.date,
      weatherSummary: weatherData.weatherLabel,
      bestTime: weatherData.bestHour.time.split("T")[1] ?? "07:00",
      reason: buildWeatherReason(weatherData.bestHour),
      routes: selectedRoutes,
      tips: buildTips(
        weatherData.bestHour.time.split("T")[1] ?? "07:00",
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
