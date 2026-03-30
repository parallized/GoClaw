import type { Coordinates } from "@goclaw/contracts";
import type { GeocodingProvider, PlaceSummary } from "../../domain/service-types";
import { fetchJson } from "@lib/http";
import { logPlanExecution } from "../../lib/plan-execution";

interface NominatimResponse {
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    suburb?: string;
    city_district?: string;
    state?: string;
  };
}

const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, { expiresAt: number; value: PlaceSummary }>();
const pending = new Map<string, Promise<PlaceSummary>>();

function cacheKey(location: Coordinates): string {
  return `${location.latitude.toFixed(4)}:${location.longitude.toFixed(4)}`;
}

function formatFallbackPlace(location: Coordinates): PlaceSummary {
  const label = location.label?.trim() || "当前位置";
  const segments = label
    .split("·")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return {
    city: segments[0] || label,
    district: segments.slice(1).join(" · ") || undefined,
    displayName: label
  };
}

function toPlaceSummary(response: NominatimResponse): PlaceSummary {
  const city = response.address?.city ?? response.address?.town ?? response.address?.village ?? response.address?.county ?? response.address?.state ?? "当前位置";
  const district = response.address?.suburb ?? response.address?.city_district;

  return {
    city,
    district,
    displayName: response.display_name
  };
}

function readCache(key: string, allowStale = false): PlaceSummary | null {
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

function writeCache(key: string, value: PlaceSummary): PlaceSummary {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
  return value;
}

export class NominatimGeocodingProvider implements GeocodingProvider {
  readonly name = "nominatim";

  async reverseGeocode(location: Coordinates): Promise<PlaceSummary> {
    const key = cacheKey(location);
    const cached = readCache(key);
    if (cached) {
      logPlanExecution("info", "Nominatim 逆地理编码命中缓存");
      return cached;
    }

    const inflight = pending.get(key);
    if (inflight) {
      logPlanExecution("info", "Nominatim 逆地理编码复用进行中的请求");
      return inflight;
    }

    const request = (async () => {
      try {
        logPlanExecution("info", "开始请求 Nominatim 逆地理编码");
        const params = new URLSearchParams({
          format: "jsonv2",
          lat: String(location.latitude),
          lon: String(location.longitude),
          zoom: "14",
          addressdetails: "1"
        });

        const response = await fetchJson<NominatimResponse>(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
          retries: 0
        });
        const place = writeCache(key, toPlaceSummary(response));
        logPlanExecution("info", `Nominatim 逆地理编码成功：${place.displayName}`);
        return place;
      } catch (error) {
        const stale = readCache(key, true);
        if (stale) {
          logPlanExecution("warn", "Nominatim 失败，回退到过期缓存位置结果");
          return stale;
        }

        logPlanExecution("warn", "Nominatim 失败，回退到输入位置标签", error instanceof Error ? error.message : String(error));
        return formatFallbackPlace(location);
      } finally {
        pending.delete(key);
      }
    })();

    pending.set(key, request);
    return request;
  }
}
