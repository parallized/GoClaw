import type { Coordinates, PhotoTheme, RunTerrain } from "@goclaw/contracts";
import type { PoiProvider, PointOfInterest } from "../../domain/service-types";
import { haversineDistanceMeters, uniqueByNameAndCoordinates } from "../../lib/geo";
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

interface AmapSearchQuery {
  kind: "keyword" | "types";
  value: string;
  matchReason: string;
}

const CACHE_TTL_MS = 20 * 60_000;
const cache = new Map<string, { expiresAt: number; value: PointOfInterest[] }>();
const pending = new Map<string, Promise<PointOfInterest[]>>();

const PAGE_SIZE = 20;
const MAX_PAGES_PER_QUERY = 3;
const RUN_QUERY_TARGET = 24;
const PHOTO_QUERY_TARGET = 12;

const RUN_QUERY_SPECS: readonly AmapSearchQuery[] = [
  { kind: "keyword", value: "公园", matchReason: "keyword:公园" },
  { kind: "keyword", value: "绿道", matchReason: "keyword:绿道" },
  { kind: "keyword", value: "步道", matchReason: "keyword:步道" },
  { kind: "keyword", value: "体育场", matchReason: "keyword:体育场" },
  { kind: "keyword", value: "操场", matchReason: "keyword:操场" },
  { kind: "keyword", value: "跑道", matchReason: "keyword:跑道" },
  { kind: "keyword", value: "运动场", matchReason: "keyword:运动场" },
  { kind: "keyword", value: "体育中心", matchReason: "keyword:体育中心" },
  { kind: "keyword", value: "健身步道", matchReason: "keyword:健身步道" },
  { kind: "keyword", value: "滨江绿道", matchReason: "keyword:滨江绿道" },
  { kind: "keyword", value: "河道绿道", matchReason: "keyword:河道绿道" },
  { kind: "keyword", value: "口袋公园", matchReason: "keyword:口袋公园" },
  { kind: "keyword", value: "校园操场", matchReason: "keyword:校园操场" },
  { kind: "types", value: "110000|110101|080000|080100", matchReason: "types:run-core" }
] as const;
const PHOTO_QUERY_SPECS: readonly AmapSearchQuery[] = [
  { kind: "keyword", value: "公园", matchReason: "keyword:公园" },
  { kind: "keyword", value: "景点", matchReason: "keyword:景点" },
  { kind: "keyword", value: "博物馆", matchReason: "keyword:博物馆" },
  { kind: "keyword", value: "观景台", matchReason: "keyword:观景台" },
  { kind: "keyword", value: "古建筑", matchReason: "keyword:古建筑" }
] as const;

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

function normalizeAmapText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
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

function normalize(
  origin: Coordinates,
  category: "run" | "photo",
  poi: AmapPoiItem,
  query: AmapSearchQuery
): PointOfInterest | null {
  const coordinates = parseCoordinates(poi.location);
  const name = normalizeAmapText(poi.name);
  if (!coordinates || !name) {
    return null;
  }

  const type = normalizeAmapText(poi.type);
  const typecode = normalizeAmapText(poi.typecode);
  const province = normalizeAmapText(poi.pname);
  const city = normalizeAmapText(poi.cityname);
  const district = normalizeAmapText(poi.adname);
  const address = normalizeAmapText(poi.address);
  const text = [name, type, address, district].filter(Boolean).join(" ");
  const rawTags = {
    type: type ?? "",
    typecode: typecode ?? "",
    province: province ?? "",
    city: city ?? "",
    district: district ?? "",
    address: address ?? ""
  };

  const parsedDistance = Number(poi.distance);
  const distanceMeters = Number.isFinite(parsedDistance)
    ? parsedDistance
    : haversineDistanceMeters(origin, coordinates);

  return {
    id: normalizeAmapText(poi.id) || `${category}-${name}`,
    name,
    coordinates: { ...coordinates, label: name },
    distanceMeters,
    category,
    tags: Object.entries(rawTags)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}:${value}`),
    themes: inferPhotoThemes(text),
    terrains: inferRunTerrains(text),
    rawTags,
    source: "amap",
    matchReason: query.matchReason
  };
}

function clampRadius(radiusMeters: number): number {
  return Math.max(1, Math.min(Math.round(radiusMeters), 50_000));
}

async function queryAround(
  config: AmapWebServiceConfig,
  location: Coordinates,
  radiusMeters: number,
  query: AmapSearchQuery,
  page: number
): Promise<AmapPoiItem[]> {
  const response = await requestAmapJson<AmapPoiResponse>(config, "/v3/place/around", {
    location: `${location.longitude},${location.latitude}`,
    radius: clampRadius(radiusMeters),
    keywords: query.kind === "keyword" ? query.value : undefined,
    types: query.kind === "types" ? query.value : undefined,
    sortrule: "distance",
    offset: PAGE_SIZE,
    page,
    extensions: "base"
  });

  return response.pois ?? [];
}

async function collectPois(
  config: AmapWebServiceConfig,
  location: Coordinates,
  radiusMeters: number,
  queries: readonly AmapSearchQuery[],
  targetCount: number
): Promise<Array<{ poi: AmapPoiItem; query: AmapSearchQuery }>> {
  const results: Array<{ poi: AmapPoiItem; query: AmapSearchQuery }> = [];
  let lastError: unknown;
  let successCount = 0;

  for (const query of queries) {
    try {
      for (let page = 1; page <= MAX_PAGES_PER_QUERY; page += 1) {
        const pageResults = await queryAround(config, location, radiusMeters, query, page);
        if (page === 1) {
          successCount += 1;
        }
        results.push(...pageResults.map((poi) => ({ poi, query })));

        if (pageResults.length < PAGE_SIZE || results.length >= targetCount) {
          break;
        }
      }

      if (results.length >= targetCount) {
        break;
      }
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

function normalizeAndFilter(
  origin: Coordinates,
  category: "run" | "photo",
  radiusMeters: number,
  items: Array<{ poi: AmapPoiItem; query: AmapSearchQuery }>
): PointOfInterest[] {
  return uniqueByNameAndCoordinates(
    items
      .map(({ poi, query }) => normalize(origin, category, poi, query))
      .filter((item): item is PointOfInterest => item !== null)
      .filter((item) => item.distanceMeters <= radiusMeters)
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
  );
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
        return writeCache(key, normalizeAndFilter(
          location,
          "run",
          radiusMeters,
          await collectPois(this.config, location, radiusMeters, RUN_QUERY_SPECS, RUN_QUERY_TARGET)
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
        return writeCache(key, normalizeAndFilter(
          location,
          "photo",
          radiusMeters,
          await collectPois(this.config, location, radiusMeters, PHOTO_QUERY_SPECS, PHOTO_QUERY_TARGET)
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
