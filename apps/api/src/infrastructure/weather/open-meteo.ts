import type { Coordinates } from "@goplan/contracts";
import type { WeatherForecast, WeatherProvider } from "../../domain/service-types";
import { fetchJson } from "../../lib/http";

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

export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly name = "open-meteo";

  async getForecast(location: Coordinates, timezone: string, days: number): Promise<WeatherForecast> {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      hourly: "temperature_2m,apparent_temperature,precipitation_probability,uv_index,cloud_cover,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset",
      timezone,
      forecast_days: String(days)
    });

    const response = await fetchJson<OpenMeteoResponse>(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

    return {
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
    };
  }
}
