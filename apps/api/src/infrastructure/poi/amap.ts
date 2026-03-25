import type { Coordinates, PhotoTheme, RunTerrain } from "@goclaw/contracts";
import type { PoiProvider, PointOfInterest } from "../../domain/service-types";
import { haversineDistanceMeters, uniqueByName } from "../../lib/geo";
import { AppError } from "../../lib/errors";
import { normalizeAmapError, requestAmapJson, type AmapWebServiceConfig } from "../amap/web-service";

interface AmapPoiItem {
  id?: string;
  name?: string;
  location?: string;
  distance?: string;
  type?: string;
  typecode?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
  address?: string;
}

interface AmapPoiResponse {
  status?: string;
  info?: string;
  infocode?: string;
  pois?: AmapPoiItem[];
}

const CACHE_TTL_MS = 20 * 60_000;
const cache = new Map<string, { expiresAt: number; value: PointOfInterest[] }>();
const pending = new Map<string, Promise<PointOfInterest[]>>();

const RUN_KEYWORDS = ["公园", "绿道", "步道", "体育场"] as const;
const PHOTO_KEYWORDS = ["公园", "景点", "博物馆", "观景台", "古建筑"] as const;

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

function parseCoordinates(location: string | undefined): Coordinates | null {
  if (!location) {
    return null;
  }

  const [longitudeText, latitudeText] = location.split(",");
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferRunTerrains(text: string): RunTerrain[] {
  const terrains = new Set<RunTerrain>();

  if (includesAny(text, ["体育场", "田径", "跑道", "操场", "运动场"])) {
    terrains.add("track");
    terrains.add("flat");
  }

  if (includesAny(text, ["公园", "绿道", "森林", "湿地", "植物园", "郊野"])) {
    terrains.add("park");
    terrains.add("shaded");
  }

  if (includesAny(text, ["江", "河", "湖", "海", "滨", "滩", "水库"])) {
    terrains.add("waterfront");
  }

  if (terrains.size === 0) {
    terrains.add("flat");
  }

  return Array.from(terrains);
}

function inferPhotoThemes(text: string): PhotoTheme[] {
  const themes = new Set<PhotoTheme>();

  if (includesAny(text, ["公园", "森林", "湿地", "植物园", "花园", "山", "自然"])) {
    themes.add("nature");
  }

  if (includesAny(text, ["江", "河", "湖", "海", "湾", "滨", "水库", "湿地"])) {
    themes.add("waterfront");
    themes.add("nature");
  }

  if (includesAny(text, ["博物馆", "美术馆", "故居", "古镇", "古建筑", "文物", "历史"])) {
    themes.add("humanity");
    themes.add("architecture");
  }

  if (includesAny(text, ["景点", "观景台", "广场", "街区", "城市", "地标"])) {
    themes.add("urban");
  }

  if (themes.size === 0) {
    themes.add("urban");
  }

  return Array.from(themes);
}

function normalize(origin: Coordinates, category: "run" | "photo", poi: AmapPoiItem): PointOfInterest | null {
  const coordinates = parseCoordinates(poi.location);
  const name = poi.name?.trim();
  if (!coordinates || !name) {
    return null;
  }

  const text = [name, poi.type, poi.address, poi.adname].filter(Boolean).join(" ");
  const rawTags = {
    type: poi.type ?? "",
    typecode: poi.typecode ?? "",
    province: poi.pname ?? "",
    city: poi.cityname ?? "",
    district: poi.adname ?? "",
    address: poi.address ?? ""
  };

  const parsedDistance = Number(poi.distance);
  const distanceMeters = Number.isFinite(parsedDistance)
    ? parsedDistance
    : haversineDistanceMeters(origin, coordinates);

  return {
    id: poi.id?.trim() || `${category}-${name}`,
    name,
    coordinates: { ...coordinates, label: name },
    distanceMeters,
    category,
    tags: Object.entries(rawTags)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}:${value}`),
    themes: inferPhotoThemes(text),
    terrains: inferRunTerrains(text),
    rawTags
  };
}

function clampRadius(radiusMeters: number): number {
  return Math.max(1, Math.min(Math.round(radiusMeters), 50_000));
}

async function queryAround(
  config: AmapWebServiceConfig,
  location: Coordinates,
  radiusMeters: number,
  keyword: string
): Promise<AmapPoiItem[]> {
  const response = await requestAmapJson<AmapPoiResponse>(config, "/v3/place/around", {
    location: `${location.longitude},${location.latitude}`,
    radius: clampRadius(radiusMeters),
    keywords: keyword,
    sortrule: "distance",
    offset: 20,
    page: 1,
    extensions: "base"
  });

  return response.pois ?? [];
}

async function collectPois(
  config: AmapWebServiceConfig,
  location: Coordinates,
  radiusMeters: number,
  keywords: readonly string[]
): Promise<AmapPoiItem[]> {
  const results: AmapPoiItem[] = [];
  let lastError: unknown;
  let successCount = 0;

  for (const keyword of keywords) {
    try {
      results.push(...await queryAround(config, location, radiusMeters, keyword));
      successCount += 1;
    } catch (error) {
      if (error instanceof AppError && /AMAP_WEB_SERVICE_KEY|高德地点服务 Key 无效|权限未开通/.test(error.message)) {
        throw error;
      }

      if (error instanceof AppError && error.status === 429) {
        if (successCount > 0) {
          lastError = error;
          break;
        }

        throw error;
      }

      lastError = error;
    }
  }

  if (successCount === 0 && lastError) {
    throw lastError;
  }

  return results;
}

export class AmapPoiProvider implements PoiProvider {
  readonly name = "amap-web-service";

  constructor(private readonly config: AmapWebServiceConfig) {}

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

    const request = (async () => {
      try {
        return writeCache(key, uniqueByName(
          (await collectPois(this.config, location, radiusMeters, RUN_KEYWORDS))
            .map((poi) => normalize(location, "run", poi))
            .filter((item): item is PointOfInterest => item !== null)
            .sort((left, right) => left.distanceMeters - right.distanceMeters)
        ));
      } catch (error) {
        const stale = readCache(key, true);
        if (stale) {
          return stale;
        }

        throw normalizeAmapError(error);
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

    const request = (async () => {
      try {
        return writeCache(key, uniqueByName(
          (await collectPois(this.config, location, radiusMeters, PHOTO_KEYWORDS))
            .map((poi) => normalize(location, "photo", poi))
            .filter((item): item is PointOfInterest => item !== null)
            .sort((left, right) => left.distanceMeters - right.distanceMeters)
        ));
      } catch (error) {
        const stale = readCache(key, true);
        if (stale) {
          return stale;
        }

        throw normalizeAmapError(error);
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, request);
    return request;
  }
}
