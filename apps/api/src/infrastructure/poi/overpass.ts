import type { Coordinates, PhotoTheme, RunTerrain } from "@goplan/contracts";
import type { PoiProvider, PointOfInterest } from "../../domain/service-types";
import { haversineDistanceMeters, uniqueByName } from "../../lib/geo";
import { AppError } from "../../lib/errors";
import { fetchJson } from "../../lib/http";

interface OverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

const CACHE_TTL_MS = 20 * 60_000;
const cache = new Map<string, { expiresAt: number; value: PointOfInterest[] }>();
const pending = new Map<string, Promise<PointOfInterest[]>>();
const DEFAULT_ENDPOINTS = ["https://overpass-api.de/api/interpreter"];

function cacheKey(kind: "run" | "photo", location: Coordinates, radiusMeters: number): string {
  return `${kind}:${location.latitude.toFixed(3)}:${location.longitude.toFixed(3)}:${radiusMeters}`;
}

function readCache(key: string, allowStale = false): PointOfInterest[] | null {
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

function writeCache(key: string, value: PointOfInterest[]): PointOfInterest[] {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
  return value;
}

function getCoordinates(element: OverpassElement): Coordinates | null {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null;
}

function inferRunTerrains(tags: Record<string, string>): RunTerrain[] {
  const terrains = new Set<RunTerrain>();
  if (tags.leisure === "track") {
    terrains.add("track");
    terrains.add("flat");
  }
  if (tags.leisure === "park" || tags.landuse === "recreation_ground") {
    terrains.add("park");
    terrains.add("shaded");
  }
  if (tags.natural === "water" || tags.waterway) {
    terrains.add("waterfront");
  }
  if (terrains.size === 0) {
    terrains.add("flat");
  }
  return Array.from(terrains);
}

function inferPhotoThemes(tags: Record<string, string>): PhotoTheme[] {
  const themes = new Set<PhotoTheme>();
  if (tags.leisure === "park" || tags.natural === "wood") {
    themes.add("nature");
  }
  if (tags.natural === "water" || tags.waterway) {
    themes.add("waterfront");
    themes.add("nature");
  }
  if (tags.historic || tags.tourism === "museum") {
    themes.add("humanity");
    themes.add("architecture");
  }
  if (tags.tourism === "attraction" || tags.tourism === "viewpoint") {
    themes.add("urban");
  }
  if (themes.size === 0) {
    themes.add("urban");
  }
  return Array.from(themes);
}

function normalize(origin: Coordinates, category: "run" | "photo", element: OverpassElement): PointOfInterest | null {
  const coordinates = getCoordinates(element);
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  if (!coordinates || !name) {
    return null;
  }

  return {
    id: `${element.type}-${element.id}`,
    name,
    coordinates: { ...coordinates, label: name },
    distanceMeters: haversineDistanceMeters(origin, coordinates),
    category,
    tags: Object.entries(tags).map(([key, value]) => `${key}:${value}`),
    themes: inferPhotoThemes(tags),
    terrains: inferRunTerrains(tags),
    rawTags: tags
  };
}

function canFallbackToNextEndpoint(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.status === 429 || error.status >= 500;
  }

  return error instanceof Error;
}

async function queryOverpass(queryText: string, endpoints: readonly string[]): Promise<OverpassElement[]> {
  let lastError: unknown;

  for (const endpoint of endpoints) {
    try {
      const response = await fetchJson<OverpassResponse>(endpoint, {
        method: "POST",
        headers: { "content-type": "text/plain;charset=UTF-8" },
        body: queryText,
        timeoutMs: 25_000,
        retries: 0
      });
      return response.elements;
    } catch (error) {
      lastError = error;
      if (!canFallbackToNextEndpoint(error)) {
        throw error;
      }
    }
  }

  if (lastError instanceof AppError) {
    throw lastError;
  }

  throw new AppError("请求外部服务失败：Overpass 服务不可用", 503);
}

export class OverpassPoiProvider implements PoiProvider {
  readonly name = "overpass";

  constructor(private readonly endpoints: readonly string[] = DEFAULT_ENDPOINTS) {}

  async searchRunPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]> {
    const key = cacheKey("run", location, radiusMeters);
    const cached = readCache(key);
    if (cached) {
      return cached;
    }

    const inflight = pending.get(key);
    if (inflight) {
      return inflight;
    }

    const queryText = `
[out:json][timeout:25];
(
  node["leisure"="park"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  way["leisure"="park"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  node["landuse"="recreation_ground"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  way["landuse"="recreation_ground"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  node["leisure"="track"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  way["leisure"="track"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
);
out center tags 80;
`;

    const request = (async () => {
      try {
        return writeCache(key, uniqueByName(
          (await queryOverpass(queryText, this.endpoints))
            .map((element) => normalize(location, "run", element))
            .filter((item): item is PointOfInterest => item !== null)
            .sort((left, right) => left.distanceMeters - right.distanceMeters)
        ));
      } catch (error) {
        const stale = readCache(key, true);
        if (stale) {
          return stale;
        }

        if (error instanceof AppError && error.status === 429) {
          throw new AppError("地点服务当前较繁忙，请稍后重试。", 503);
        }

        if (error instanceof AppError && error.status >= 500) {
          throw new AppError("地点服务暂时不可用，请稍后重试。", 503);
        }

        throw error;
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, request);
    return request;
  }

  async searchPhotoPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]> {
    const key = cacheKey("photo", location, radiusMeters);
    const cached = readCache(key);
    if (cached) {
      return cached;
    }

    const inflight = pending.get(key);
    if (inflight) {
      return inflight;
    }

    const queryText = `
[out:json][timeout:25];
(
  node["tourism"="viewpoint"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  way["tourism"="viewpoint"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  node["tourism"="attraction"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  way["tourism"="attraction"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  node["historic"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  way["historic"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  node["leisure"="park"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  way["leisure"="park"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  node["tourism"="museum"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  node["natural"="water"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
  way["natural"="water"]["name"](around:${radiusMeters},${location.latitude},${location.longitude});
);
out center tags 120;
`;

    const request = (async () => {
      try {
        return writeCache(key, uniqueByName(
          (await queryOverpass(queryText, this.endpoints))
            .map((element) => normalize(location, "photo", element))
            .filter((item): item is PointOfInterest => item !== null)
            .sort((left, right) => left.distanceMeters - right.distanceMeters)
        ));
      } catch (error) {
        const stale = readCache(key, true);
        if (stale) {
          return stale;
        }

        if (error instanceof AppError && error.status === 429) {
          throw new AppError("地点服务当前较繁忙，请稍后重试。", 503);
        }

        if (error instanceof AppError && error.status >= 500) {
          throw new AppError("地点服务暂时不可用，请稍后重试。", 503);
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
