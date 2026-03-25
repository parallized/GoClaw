import type { Coordinates } from "@goclaw/contracts";
import type { GeocodingProvider, PlaceSummary } from "../../domain/service-types";
import { normalizeAmapError, requestAmapJson, type AmapWebServiceConfig } from "../amap/web-service";

interface AmapRegeocodeResponse {
  status?: string;
  info?: string;
  infocode?: string;
  regeocode?: {
    formatted_address?: string;
    addressComponent?: {
      city?: string | string[];
      district?: string;
      province?: string;
    };
  };
}

const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { expiresAt: number; value: PlaceSummary }>();
const pending = new Map<string, Promise<PlaceSummary>>();

function cacheKey(location: Coordinates): string {
  return `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
}

function readCache(key: string): PlaceSummary | null {
  const item = cache.get(key);
  if (!item) {
    return null;
  }

  if (item.expiresAt > Date.now()) {
    return item.value;
  }

  cache.delete(key);
  return null;
}

function writeCache(key: string, value: PlaceSummary): PlaceSummary {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
  return value;
}

function normalizeCity(city: string | string[] | undefined, province: string | undefined, district: string | undefined): string {
  if (typeof city === "string" && city.trim()) {
    return city.trim();
  }

  if (Array.isArray(city)) {
    const first = city.find((value) => value.trim());
    if (first) {
      return first.trim();
    }
  }

  if (province?.trim()) {
    return province.trim();
  }

  if (district?.trim()) {
    return district.trim();
  }

  return "当前位置";
}

function toPlaceSummary(response: AmapRegeocodeResponse): PlaceSummary {
  const addressComponent = response.regeocode?.addressComponent;
  const displayName = response.regeocode?.formatted_address?.trim();

  if (!displayName) {
    throw new Error("高德逆地理编码未返回有效地址");
  }

  return {
    city: normalizeCity(addressComponent?.city, addressComponent?.province, addressComponent?.district),
    district: addressComponent?.district?.trim() || undefined,
    displayName
  };
}

export class AmapGeocodingProvider implements GeocodingProvider {
  readonly name = "amap-web-service";

  constructor(private readonly config: AmapWebServiceConfig) {}

  async reverseGeocode(location: Coordinates): Promise<PlaceSummary> {
    const key = cacheKey(location);
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
        const response = await requestAmapJson<AmapRegeocodeResponse>(this.config, "/v3/geocode/regeo", {
          location: `${location.longitude},${location.latitude}`,
          extensions: "base",
          radius: 500,
          roadlevel: 0
        });

        return writeCache(key, toPlaceSummary(response));
      } catch (error) {
        throw normalizeAmapError(error);
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, request);
    return request;
  }
}
