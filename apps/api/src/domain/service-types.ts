import type { Coordinates, PhotoTheme, RunTerrain } from "@goclaw/contracts";
import type { PoiCandidateQualityTier } from "@goclaw/contracts";

export type WeatherCode = number;

export interface HourlyWeatherPoint {
  time: string;
  temperatureC: number;
  apparentTemperatureC: number;
  precipitationProbability: number;
  uvIndex: number;
  cloudCover: number;
  windSpeedKmh: number;
}

export interface DailyWeatherPoint {
  date: string;
  weatherCode: WeatherCode;
  temperatureMaxC: number;
  temperatureMinC: number;
  precipitationProbabilityMax: number;
  uvIndexMax: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherForecast {
  timezone: string;
  hourly: HourlyWeatherPoint[];
  daily: DailyWeatherPoint[];
}

export interface PlaceSummary {
  city: string;
  district?: string;
  displayName: string;
}

export interface PointOfInterest {
  id: string;
  name: string;
  coordinates: Coordinates;
  distanceMeters: number;
  category: "run" | "photo";
  tags: string[];
  themes: PhotoTheme[];
  terrains: RunTerrain[];
  rawTags: Record<string, string>;
  source?: string;
  matchReason?: string;
  qualityTier?: PoiCandidateQualityTier;
  description?: string;
}

export interface RoutePlan {
  distanceMeters: number;
  durationSeconds: number;
  source: string;
}

export interface WeatherProvider {
  readonly name: string;
  getForecast(location: Coordinates, timezone: string, days: number): Promise<WeatherForecast>;
}

export interface GeocodingProvider {
  readonly name: string;
  reverseGeocode(location: Coordinates): Promise<PlaceSummary>;
}

export interface PoiProvider {
  readonly name: string;
  searchRunPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]>;
  searchPhotoPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]>;
}

export interface RoutingProvider {
  readonly name: string;
  getWalkingRoute(from: Coordinates, to: Coordinates): Promise<RoutePlan>;
}

export interface NavigationProvider {
  readonly name: string;
  buildNavigationUrl(destination: Coordinates, label: string): string;
}

export interface AiProvider {
  readonly name: string;
  generateText(input: { system: string; user: string; temperature?: number }): Promise<string>;
}
