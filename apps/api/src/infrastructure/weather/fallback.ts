import type { Coordinates } from "@goclaw/contracts";
import type { WeatherForecast, WeatherProvider } from "../../domain/service-types";
import { AppError } from "../../lib/errors";
import { logPlanExecution } from "../../lib/plan-execution";

function shouldFallbackFromPrimary(error: unknown): boolean {
  return error instanceof AppError
    ? error.status === 429 || error.status >= 500
    : true;
}

export class FallbackWeatherProvider implements WeatherProvider {
  readonly name: string;

  constructor(
    private readonly primary: WeatherProvider,
    private readonly fallback: WeatherProvider
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async getForecast(location: Coordinates, timezone: string, days: number): Promise<WeatherForecast> {
    try {
      logPlanExecution("info", `优先使用 ${this.primary.name} 获取天气数据（${days} 天）`);
      return await this.primary.getForecast(location, timezone, days);
    } catch (error) {
      if (!shouldFallbackFromPrimary(error)) {
        logPlanExecution("error", `${this.primary.name} 天气获取失败且不可回退`);
        throw error;
      }

      logPlanExecution("warn", `${this.primary.name} 天气获取失败，回退到 ${this.fallback.name}`);
      return await this.fallback.getForecast(location, timezone, days);
    }
  }
}
