import type { Coordinates } from "@goclaw/contracts";
import type { DailyWeatherPoint, HourlyWeatherPoint, WeatherForecast, WeatherProvider } from "../../domain/service-types";
import { AppError } from "../../lib/errors";
import { fetchJson } from "../../lib/http";
import { logPlanExecution } from "../../lib/plan-execution";

interface MetNoResponse {
  properties?: {
    timeseries?: MetNoTimeseriesItem[];
  };
}

interface MetNoTimeseriesItem {
  time?: string;
  data?: {
    instant?: {
      details?: {
        air_temperature?: number;
        cloud_area_fraction?: number;
        wind_speed?: number;
      };
    };
    next_1_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_6_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
    next_12_hours?: {
      summary?: { symbol_code?: string };
      details?: { precipitation_amount?: number };
    };
  };
}

type NormalizedHourlyPoint = HourlyWeatherPoint & {
  weatherCode: number;
};

const CACHE_TTL_MS = 15 * 60_000;
const cache = new Map<string, { expiresAt: number; value: WeatherForecast }>();
const pending = new Map<string, Promise<WeatherForecast>>();

function cacheKey(location: Coordinates, timezone: string, days: number): string {
  return `${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}:${timezone}:${days}`;
}

function readCache(key: string, allowStale = false): WeatherForecast | null {
  const item = cache.get(key);
  if (!item) {
    return null;
  }

  if (allowStale || item.expiresAt > Date.now()) {
    return item.value;
  }

  cache.delete(key);
  return null;
}

function writeCache(key: string, value: WeatherForecast): WeatherForecast {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
  return value;
}

function toLocalIso(utcTime: string, timezone: string): string {
  const date = new Date(utcTime);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const pick = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}

function timeHour(localIso: string): number {
  const part = localIso.split("T")[1]?.split(":")[0];
  const parsed = Number(part);
  return Number.isFinite(parsed) ? parsed : 0;
}

function weatherSymbolCode(data: MetNoTimeseriesItem["data"]): string {
  return data?.next_1_hours?.summary?.symbol_code
    ?? data?.next_6_hours?.summary?.symbol_code
    ?? data?.next_12_hours?.summary?.symbol_code
    ?? "";
}

function precipitationAmount(data: MetNoTimeseriesItem["data"]): number {
  return data?.next_1_hours?.details?.precipitation_amount
    ?? data?.next_6_hours?.details?.precipitation_amount
    ?? data?.next_12_hours?.details?.precipitation_amount
    ?? 0;
}

function estimatePrecipitationProbability(amountMm: number, cloudCover: number): number {
  if (amountMm <= 0) {
    return cloudCover >= 95 ? 10 : 0;
  }

  const base = amountMm >= 2
    ? 90
    : amountMm >= 1
      ? 75
      : amountMm >= 0.4
        ? 55
        : amountMm >= 0.1
          ? 35
          : 20;

  return Math.min(100, Math.round(base + cloudCover * 0.12));
}

function estimateUvIndex(localHour: number, cloudCover: number): number {
  if (localHour < 6 || localHour > 18) {
    return 0;
  }

  const solar = Math.max(0, 7 - Math.abs(localHour - 12) * 1.25);
  const cloudFactor = Math.max(0.2, 1 - cloudCover / 120);
  return Number((solar * cloudFactor).toFixed(1));
}

function symbolToWeatherCode(symbol: string, cloudCover: number, precipitationProb: number): number {
  const normalized = symbol.toLowerCase();

  if (normalized.includes("thunder")) {
    return 95;
  }

  if (normalized.includes("fog")) {
    return 45;
  }

  if (normalized.includes("snow") || normalized.includes("sleet")) {
    return 71;
  }

  if (normalized.includes("showers")) {
    return 80;
  }

  if (normalized.includes("rain")) {
    return precipitationProb >= 60 ? 63 : 61;
  }

  if (normalized.includes("drizzle")) {
    return 53;
  }

  if (normalized.includes("cloudy")) {
    return normalized.includes("partly") ? 2 : 3;
  }

  if (normalized.includes("fair")) {
    return 1;
  }

  if (normalized.includes("clear")) {
    return 0;
  }

  if (precipitationProb >= 60) {
    return 61;
  }

  if (cloudCover >= 85) {
    return 3;
  }

  if (cloudCover >= 45) {
    return 2;
  }

  return 1;
}

function buildHourlyForecast(timeseries: MetNoTimeseriesItem[], timezone: string): NormalizedHourlyPoint[] {
  return timeseries.flatMap((entry) => {
    const utcTime = entry.time;
    const details = entry.data?.instant?.details;
    if (!utcTime || !details) {
      return [];
    }

    const time = toLocalIso(utcTime, timezone);
    const temperatureC = details.air_temperature ?? 0;
    const cloudCover = details.cloud_area_fraction ?? 0;
    const windSpeedKmh = (details.wind_speed ?? 0) * 3.6;
    const precipAmount = precipitationAmount(entry.data);
    const precipitationProbability = estimatePrecipitationProbability(precipAmount, cloudCover);
    const uvIndex = estimateUvIndex(timeHour(time), cloudCover);
    const weatherCode = symbolToWeatherCode(weatherSymbolCode(entry.data), cloudCover, precipitationProbability);

    return [{
      time,
      temperatureC,
      apparentTemperatureC: temperatureC,
      precipitationProbability,
      uvIndex,
      cloudCover,
      windSpeedKmh: Number(windSpeedKmh.toFixed(1)),
      weatherCode
    }];
  });
}

function buildDailyForecast(hourly: NormalizedHourlyPoint[], days: number): DailyWeatherPoint[] {
  const grouped = new Map<string, NormalizedHourlyPoint[]>();
  for (const point of hourly) {
    const date = point.time.split("T")[0] ?? point.time;
    const bucket = grouped.get(date) ?? [];
    bucket.push(point);
    grouped.set(date, bucket);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, days)
    .map(([date, points]) => {
      const midday = points.find((point) => {
        const hour = timeHour(point.time);
        return hour >= 11 && hour <= 13;
      }) ?? points[Math.floor(points.length / 2)] ?? points[0]!;

      return {
        date,
        weatherCode: midday.weatherCode,
        temperatureMaxC: Math.max(...points.map((point) => point.temperatureC)),
        temperatureMinC: Math.min(...points.map((point) => point.temperatureC)),
        precipitationProbabilityMax: Math.max(...points.map((point) => point.precipitationProbability)),
        uvIndexMax: Math.max(...points.map((point) => point.uvIndex)),
        sunrise: `${date}T06:00`,
        sunset: `${date}T18:00`
      };
    });
}

export class MetNoWeatherProvider implements WeatherProvider {
  readonly name = "met-no";

  async getForecast(location: Coordinates, timezone: string, days: number): Promise<WeatherForecast> {
    const key = cacheKey(location, timezone, days);
    const cached = readCache(key);
    if (cached) {
      logPlanExecution("info", "MET Norway 天气命中缓存");
      return cached;
    }

    const inflight = pending.get(key);
    if (inflight) {
      logPlanExecution("info", "MET Norway 天气请求复用进行中的 Promise");
      return inflight;
    }

    const params = new URLSearchParams({
      lat: String(location.latitude),
      lon: String(location.longitude)
    });

    const request = (async () => {
      try {
        logPlanExecution("info", "开始请求 MET Norway 天气服务");
        const response = await fetchJson<MetNoResponse>(`https://api.met.no/weatherapi/locationforecast/2.0/compact?${params.toString()}`, {
          retries: 0,
          timeoutMs: 8_000
        });

        const timeseries = response.properties?.timeseries ?? [];
        const hourly = buildHourlyForecast(timeseries, timezone);
        const daily = buildDailyForecast(hourly, days);
        if (hourly.length === 0 || daily.length === 0) {
          throw new AppError("天气服务未返回可用数据", 502);
        }

        const forecast = writeCache(key, {
          timezone,
          hourly,
          daily
        });
        logPlanExecution("info", `MET Norway 返回成功：${forecast.daily.length} 天、${forecast.hourly.length} 条小时数据`);
        return forecast;
      } catch (error) {
        const stale = readCache(key, true);
        if (stale) {
          logPlanExecution("warn", "MET Norway 失败，回退到过期缓存数据");
          return stale;
        }

        if (error instanceof AppError && error.status === 429) {
          throw new AppError("天气服务当前较繁忙，请稍后重试。", 503);
        }

        if (error instanceof AppError && error.status >= 500) {
          throw new AppError("天气服务暂时不可用，请稍后重试。", 503);
        }

        throw error;
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, request);
    return request;
  }
}
