import type { Coordinates } from "@goplan/contracts";
import { fetchLocationLabel } from "./api";

export interface GeoResult {
  location: Coordinates;
  timezone: string;
}

const labelCache = new Map<string, string>();
const pending = new Map<string, Promise<string | undefined>>();

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

async function resolveLocationLabel(latitude: number, longitude: number): Promise<string | undefined> {
  const key = cacheKey(latitude, longitude);
  const cached = labelCache.get(key);
  if (cached) {
    return cached;
  }

  const inflight = pending.get(key);
  if (inflight) {
    return inflight;
  }

  const request = fetchLocationLabel(latitude, longitude)
    .then((result) => {
      const district = result.district?.trim();
      const label = district ? `${result.city} · ${district}` : result.city;
      labelCache.set(key, label);
      return label;
    })
    .catch(() => undefined)
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

export function detectLocation(): Promise<GeoResult> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("浏览器不支持定位"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const label = await resolveLocationLabel(latitude, longitude);
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        resolve({
          location: { latitude, longitude, label },
          timezone
        });
      },
      (err) => {
        reject(new Error(err.code === 1 ? "定位权限被拒绝" : "定位失败"));
      },
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  });
}
