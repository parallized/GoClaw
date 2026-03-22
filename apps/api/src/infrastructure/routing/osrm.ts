import type { Coordinates } from "@goplan/contracts";
import type { RoutePlan, RoutingProvider } from "../../domain/service-types";
import { AppError } from "../../lib/errors";
import { fetchJson } from "../../lib/http";

interface OsrmResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
  }>;
}

const CACHE_TTL_MS = 20 * 60_000;
const cache = new Map<string, { expiresAt: number; value: RoutePlan }>();
const pending = new Map<string, Promise<RoutePlan>>();

function cacheKey(from: Coordinates, to: Coordinates): string {
  return `${from.latitude.toFixed(4)}:${from.longitude.toFixed(4)}:${to.latitude.toFixed(4)}:${to.longitude.toFixed(4)}`;
}

function readCache(key: string, allowStale = false): RoutePlan | null {
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

function writeCache(key: string, value: RoutePlan): RoutePlan {
  cache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
  return value;
}

export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = "osrm";

  async getWalkingRoute(from: Coordinates, to: Coordinates): Promise<RoutePlan> {
    const key = cacheKey(from, to);
    const cached = readCache(key);
    if (cached) {
      return cached;
    }

    const inflight = pending.get(key);
    if (inflight) {
      return inflight;
    }

    const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const request = (async () => {
      try {
        const response = await fetchJson<OsrmResponse>(`https://router.project-osrm.org/route/v1/foot/${coords}?overview=false&alternatives=false&steps=false`, {
          timeoutMs: 20_000,
          retries: 1
        });

        const route = response.routes?.[0];
        if (response.code !== "Ok" || !route) {
          throw new AppError("路径服务暂时无法返回有效路线", 502);
        }

        return writeCache(key, {
          distanceMeters: route.distance,
          durationSeconds: route.duration,
          source: this.name
        });
      } catch (error) {
        const stale = readCache(key, true);
        if (stale) {
          return stale;
        }

        if (error instanceof AppError && error.status === 429) {
          throw new AppError("路径服务当前较繁忙，请稍后重试。", 503);
        }

        if (error instanceof AppError && error.status >= 500) {
          throw new AppError("路径服务暂时不可用，请稍后重试。", 503);
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
