import type { DailyWeatherPoint, HourlyWeatherPoint } from "../domain/service-types";

const WEATHER_LABELS: Record<number, string> = {
  0: "晴朗",
  1: "大部晴",
  2: "局部多云",
  3: "多云",
  45: "有雾",
  48: "雾凇",
  51: "小毛雨",
  53: "毛雨",
  55: "强毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  80: "阵雨",
  95: "雷阵雨"
};

export function getWeatherLabel(code: number): string {
  return WEATHER_LABELS[code] ?? `天气代码 ${code}`;
}

export function summarizeDailyWeather(day: DailyWeatherPoint): string {
  return `${getWeatherLabel(day.weatherCode)} ${day.temperatureMinC.toFixed(0)}-${day.temperatureMaxC.toFixed(0)}℃ · 降水 ${day.precipitationProbabilityMax}% · UV ${day.uvIndexMax.toFixed(1)}`;
}

export function scoreRunHour(hour: HourlyWeatherPoint): number {
  const temperaturePenalty = Math.abs(hour.temperatureC - 18) * 2.4;
  const precipitationPenalty = hour.precipitationProbability * 0.9;
  const uvPenalty = hour.uvIndex * 9;
  const windPenalty = Math.max(hour.windSpeedKmh - 20, 0) * 1.8;
  const comfortBonus = Math.max(0, 10 - Math.abs(hour.apparentTemperatureC - 18));
  return 130 - temperaturePenalty - precipitationPenalty - uvPenalty - windPenalty + comfortBonus;
}

export function classifyLight(day: DailyWeatherPoint, hour?: HourlyWeatherPoint): "sunrise" | "sunset" | "soft" | "dramatic" | "overcast" {
  const cloud = hour?.cloudCover ?? 40;
  if (day.precipitationProbabilityMax >= 55 || cloud >= 85) {
    return "overcast";
  }

  if (cloud >= 45) {
    return "dramatic";
  }

  if (cloud >= 15) {
    return "soft";
  }

  const hourText = hour?.time.split("T")[1] ?? "";
  if (hourText >= "16:30") {
    return "sunset";
  }

  return "sunrise";
}

