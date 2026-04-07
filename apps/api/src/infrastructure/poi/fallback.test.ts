import { describe, expect, it } from "bun:test";
import type { PointOfInterest } from "../../domain/service-types";
import { FallbackPoiProvider } from "./fallback";

const location = { latitude: 30.2251, longitude: 120.0191 };

function makePoi(id: string, name: string, longitude: number): PointOfInterest {
  return {
    id,
    name,
    coordinates: { latitude: 30.2251, longitude },
    distanceMeters: Math.round(Math.abs(longitude - 120.0191) * 100_000),
    category: "run",
    tags: [],
    themes: [],
    terrains: ["park"],
    rawTags: {},
    source: id.startsWith("amap") ? "amap" : "overpass"
  };
}

describe("FallbackPoiProvider", () => {
  it("supplements sparse primary run POIs with fallback results", async () => {
    const provider = new FallbackPoiProvider(
      {
        name: "primary",
        searchRunPois: async () => [
          makePoi("amap-1", "空谷长滩水公园", 120.0195),
          makePoi("amap-2", "校园操场", 120.0202)
        ],
        searchPhotoPois: async () => []
      },
      {
        name: "fallback",
        searchRunPois: async () => [
          makePoi("osm-1", "空谷长滩水公园", 120.01951),
          makePoi("osm-2", "滨江健身步道", 120.0212),
          makePoi("osm-3", "河道绿道", 120.0222)
        ],
        searchPhotoPois: async () => []
      }
    );

    const result = await provider.searchRunPois(location, 2500);

    expect(result.map((item) => item.name)).toEqual([
      "空谷长滩水公园",
      "校园操场",
      "滨江健身步道",
      "河道绿道"
    ]);
  });
});
