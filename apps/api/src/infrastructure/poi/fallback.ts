import type { Coordinates } from "@goclaw/contracts";
import type { PoiProvider, PointOfInterest } from "../../domain/service-types";
import { uniqueByNameAndCoordinates } from "../../lib/geo";
import { shouldFallbackFromPrimary } from "../amap/web-service";
import { logPlanExecution } from "../../lib/plan-execution";

const MIN_RUN_PRIMARY_RESULTS = 8;

export class FallbackPoiProvider implements PoiProvider {
  readonly name: string;

  constructor(
    private readonly primary: PoiProvider,
    private readonly fallback: PoiProvider
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async searchRunPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]> {
    try {
      logPlanExecution("info", `优先使用 ${this.primary.name} 搜索跑步 POI（${radiusMeters} 米）`);
      const primaryPois = await this.primary.searchRunPois(location, radiusMeters);

      if (primaryPois.length >= MIN_RUN_PRIMARY_RESULTS) {
        return primaryPois;
      }

      logPlanExecution("warn", `${this.primary.name} 在严格半径内仅返回 ${primaryPois.length} 个跑步 POI，继续用 ${this.fallback.name} 补集`);

      try {
        const fallbackPois = await this.fallback.searchRunPois(location, radiusMeters);
        const merged = uniqueByNameAndCoordinates(
          [...primaryPois, ...fallbackPois].sort((left, right) => left.distanceMeters - right.distanceMeters)
        );

        logPlanExecution("info", `补集后共获得 ${merged.length} 个跑步 POI`);
        return merged;
      } catch (fallbackError) {
        logPlanExecution("warn", `${this.fallback.name} 跑步 POI 补集失败，保留 ${this.primary.name} 已获得结果`);
        return primaryPois;
      }
    } catch (error) {
      if (!shouldFallbackFromPrimary(error)) {
        logPlanExecution("error", `${this.primary.name} 跑步 POI 搜索失败且不可回退`);
        throw error;
      }

      logPlanExecution("warn", `${this.primary.name} 跑步 POI 搜索失败，回退到 ${this.fallback.name}`);
      return await this.fallback.searchRunPois(location, radiusMeters);
    }
  }

  async searchPhotoPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]> {
    try {
      logPlanExecution("info", `优先使用 ${this.primary.name} 搜索摄影 POI（${radiusMeters} 米）`);
      return await this.primary.searchPhotoPois(location, radiusMeters);
    } catch (error) {
      if (!shouldFallbackFromPrimary(error)) {
        logPlanExecution("error", `${this.primary.name} 摄影 POI 搜索失败且不可回退`);
        throw error;
      }

      logPlanExecution("warn", `${this.primary.name} 摄影 POI 搜索失败，回退到 ${this.fallback.name}`);
      return await this.fallback.searchPhotoPois(location, radiusMeters);
    }
  }
}
