import type { Coordinates, PhotoTheme, RunTerrain } from "@goplan/contracts";
import type { PoiProvider, PointOfInterest } from "../../domain/service-types";
import { haversineDistanceMeters, uniqueByName } from "../../lib/geo";
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

async function query(query: string): Promise<OverpassElement[]> {
  const response = await fetchJson<OverpassResponse>("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: query,
    timeoutMs: 25_000
  });
  return response.elements;
}

export class OverpassPoiProvider implements PoiProvider {
  readonly name = "overpass";

  async searchRunPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]> {
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

    return uniqueByName(
      (await query(queryText))
        .map((element) => normalize(location, "run", element))
        .filter((item): item is PointOfInterest => item !== null)
        .sort((left, right) => left.distanceMeters - right.distanceMeters)
    );
  }

  async searchPhotoPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]> {
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

    return uniqueByName(
      (await query(queryText))
        .map((element) => normalize(location, "photo", element))
        .filter((item): item is PointOfInterest => item !== null)
        .sort((left, right) => left.distanceMeters - right.distanceMeters)
    );
  }
}
