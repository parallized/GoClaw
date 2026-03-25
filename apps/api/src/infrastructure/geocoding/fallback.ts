import type { Coordinates } from "@goclaw/contracts";
import type { GeocodingProvider, PlaceSummary } from "../../domain/service-types";
import { shouldFallbackFromPrimary } from "../amap/web-service";
import { logPlanExecution } from "../../lib/plan-execution";

export class FallbackGeocodingProvider implements GeocodingProvider {
  readonly name: string;

  constructor(
    private readonly primary: GeocodingProvider,
    private readonly fallback: GeocodingProvider
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async reverseGeocode(location: Coordinates): Promise<PlaceSummary> {
    try {
      logPlanExecution("info", `优先使用 ${this.primary.name} 解析位置`);
      return await this.primary.reverseGeocode(location);
    } catch (error) {
      if (!shouldFallbackFromPrimary(error)) {
        logPlanExecution("error", `${this.primary.name} 位置解析失败且不可回退`);
        throw error;
      }

      logPlanExecution("warn", `${this.primary.name} 位置解析失败，回退到 ${this.fallback.name}`);
      return await this.fallback.reverseGeocode(location);
    }
  }
}
