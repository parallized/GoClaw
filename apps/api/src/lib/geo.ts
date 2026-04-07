import type { Coordinates } from "@goclaw/contracts";

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(from: Coordinates, to: Coordinates): number {
  const latDistance = toRadians(to.latitude - from.latitude);
  const lonDistance = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);

  const a =
    Math.sin(latDistance / 2) ** 2 +
    Math.sin(lonDistance / 2) ** 2 * Math.cos(fromLat) * Math.cos(toLat);

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function uniqueByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s，。、“”‘’：:；;、,.!?！？（）()\-—]/gu, "");
}

export function uniqueByNameAndCoordinates<T extends { name: string; coordinates: Coordinates }>(
  items: readonly T[],
  distanceThresholdMeters = 120
): T[] {
  const result: T[] = [];

  for (const item of items) {
    const normalizedName = normalizeName(item.name);
    if (!normalizedName) {
      continue;
    }

    const duplicated = result.some((existing) => {
      const existingName = normalizeName(existing.name);
      const distance = haversineDistanceMeters(existing.coordinates, item.coordinates);

      if (distance > distanceThresholdMeters) {
        return false;
      }

      if (existingName === normalizedName) {
        return true;
      }

      return distance <= 35 && (
        existingName.includes(normalizedName) ||
        normalizedName.includes(existingName)
      );
    });

    if (!duplicated) {
      result.push(item);
    }
  }

  return result;
}
