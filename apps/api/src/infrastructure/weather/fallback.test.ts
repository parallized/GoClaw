import { describe, expect, it } from "bun:test";
import type { WeatherForecast, WeatherProvider } from "../../domain/service-types";
import { AppError } from "../../lib/errors";
import { FallbackWeatherProvider } from "./fallback";

const sampleForecast: WeatherForecast = {
  timezone: "Asia/Shanghai",
  hourly: [{
    time: "2026-04-07T08:00",
    temperatureC: 20,
    apparentTemperatureC: 20,
    precipitationProbability: 10,
    uvIndex: 3,
    cloudCover: 30,
    windSpeedKmh: 8
  }],
  daily: [{
    date: "2026-04-07",
    weatherCode: 1,
    temperatureMaxC: 24,
    temperatureMinC: 16,
    precipitationProbabilityMax: 10,
    uvIndexMax: 4,
    sunrise: "2026-04-07T06:00",
    sunset: "2026-04-07T18:00"
  }]
};

describe("FallbackWeatherProvider", () => {
  it("falls back to secondary provider when primary weather service is unavailable", async () => {
    const primary: WeatherProvider = {
      name: "primary-weather",
      getForecast: async () => {
        throw new AppError("天气服务暂时不可用，请稍后重试。", 503);
      }
    };
    const fallback: WeatherProvider = {
      name: "fallback-weather",
      getForecast: async () => sampleForecast
    };

    const provider = new FallbackWeatherProvider(primary, fallback);
    const forecast = await provider.getForecast({
      latitude: 30.2251,
      longitude: 120.0191
    }, "Asia/Shanghai", 7);

    expect(provider.name).toBe("primary-weather+fallback-weather");
    expect(forecast).toEqual(sampleForecast);
  });

  it("does not swallow non-retryable weather errors", async () => {
    const primary: WeatherProvider = {
      name: "primary-weather",
      getForecast: async () => {
        throw new AppError("参数错误", 400);
      }
    };
    const fallback: WeatherProvider = {
      name: "fallback-weather",
      getForecast: async () => sampleForecast
    };

    const provider = new FallbackWeatherProvider(primary, fallback);

    await expect(provider.getForecast({
      latitude: 30.2251,
      longitude: 120.0191
    }, "Asia/Shanghai", 7)).rejects.toMatchObject({
      status: 400,
      message: "参数错误"
    });
  });
});
