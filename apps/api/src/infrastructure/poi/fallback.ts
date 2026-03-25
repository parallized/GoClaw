import type { Coordinates } from "@goplan/contracts";
import type { PoiProvider, PointOfInterest } from "../../domain/service-types";
import { shouldFallbackFromPrimary } from "../amap/web-service";
import { logPlanExecution } from "../../lib/plan-execution";

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
      return await this.primary.searchRunPois(location, radiusMeters);
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
