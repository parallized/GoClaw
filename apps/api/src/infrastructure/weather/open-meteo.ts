import type { Coordinates } from "@goplan/contracts";
import type { WeatherForecast, WeatherProvider } from "../../domain/service-types";
import { AppError } from "../../lib/errors";
import { fetchJson } from "../../lib/http";
import { logPlanExecution } from "../../lib/plan-execution";

interface OpenMeteoResponse {
  timezone: string;
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation_probability: number[];
    uv_index: number[];
    cloud_cover: number[];
    wind_speed_10m: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    uv_index_max: number[];
    sunrise: string[];
    sunset: string[];
  };
}

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

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly name = "open-meteo";

  async getForecast(location: Coordinates, timezone: string, days: number): Promise<WeatherForecast> {
    const key = cacheKey(location, timezone, days);
    const cached = readCache(key);
    if (cached) {
      logPlanExecution("info", `天气命中缓存：${timezone}，${days} 天`);
      return cached;
    }

    const inflight = pending.get(key);
    if (inflight) {
      logPlanExecution("info", "天气请求复用进行中的 Promise");
      return inflight;
    }

    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      hourly: "temperature_2m,apparent_temperature,precipitation_probability,uv_index,cloud_cover,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset",
      timezone,
      forecast_days: String(days)
    });

    const request = (async () => {
      try {
        logPlanExecution("info", `开始请求 Open-Meteo 天气服务，天数 ${days}`);
        const response = await fetchJson<OpenMeteoResponse>(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
          retries: 1
        });

        const forecast = writeCache(key, {
          timezone: response.timezone,
          hourly: response.hourly.time.map((time, index) => ({
            time,
            temperatureC: response.hourly.temperature_2m[index] ?? 0,
            apparentTemperatureC: response.hourly.apparent_temperature[index] ?? 0,
            precipitationProbability: response.hourly.precipitation_probability[index] ?? 0,
            uvIndex: response.hourly.uv_index[index] ?? 0,
            cloudCover: response.hourly.cloud_cover[index] ?? 0,
            windSpeedKmh: response.hourly.wind_speed_10m[index] ?? 0
          })),
          daily: response.daily.time.map((date, index) => ({
            date,
            weatherCode: response.daily.weather_code[index] ?? 0,
            temperatureMaxC: response.daily.temperature_2m_max[index] ?? 0,
            temperatureMinC: response.daily.temperature_2m_min[index] ?? 0,
            precipitationProbabilityMax: response.daily.precipitation_probability_max[index] ?? 0,
            uvIndexMax: response.daily.uv_index_max[index] ?? 0,
            sunrise: response.daily.sunrise[index] ?? `${date}T06:00`,
            sunset: response.daily.sunset[index] ?? `${date}T18:00`
          }))
        });
        logPlanExecution("info", `天气服务返回成功：${forecast.daily.length} 天、${forecast.hourly.length} 条小时数据`);
        return forecast;
      } catch (error) {
        const stale = readCache(key, true);
        if (stale) {
          logPlanExecution("warn", "天气服务失败，回退到过期缓存数据");
          return stale;
        }

        if (error instanceof AppError) {
          if (error.status === 429) {
            throw new AppError("天气服务当前较繁忙，请稍后重试。", 503);
          }

          if (error.status >= 500) {
            throw new AppError("天气服务暂时不可用，请稍后重试。", 503);
          }
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
