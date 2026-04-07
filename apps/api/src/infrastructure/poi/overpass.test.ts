import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { OverpassPoiProvider } from "./overpass";

const location = { latitude: 31.2304, longitude: 121.4737 };
const secondaryLocation = { latitude: 31.2308, longitude: 121.4741 };

function makeResponse(name = "世纪公园", latitude = 31.231, longitude = 121.474) {
  return {
    elements: [
      {
        id: 1,
        type: "node",
        lat: latitude,
        lon: longitude,
        tags: {
          name,
          leisure: "park"
        }
      }
    ]
  };
}

function makeRunResponse() {
  return {
    elements: [
      {
        id: 1,
        type: "node",
        lat: 31.231,
        lon: 121.474,
        tags: {
          name: "校园操场",
          leisure: "stadium"
        }
      },
      {
        id: 2,
        type: "way",
        center: { lat: 31.232, lon: 121.475 },
        tags: {
          name: "滨水步道",
          highway: "footway"
        }
      }
    ]
  };
}

describe("OverpassPoiProvider", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  it("maps 429 to a user-friendly 503 error", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }));

    const provider = new OverpassPoiProvider();
    await expect(provider.searchRunPois(location, 5000)).rejects.toMatchObject({
      status: 503,
      message: "地点服务当前较繁忙，请稍后重试。"
    });
  });

  it("maps timeout failures to a user-friendly 503 error", async () => {
    spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("The operation was aborted.", "AbortError"));

    const provider = new OverpassPoiProvider();
    await expect(provider.searchRunPois(location, 5000)).rejects.toMatchObject({
      status: 503,
      message: "地点服务暂时不可用，请稍后重试。"
    });
  });

  it("falls back to the next endpoint when the primary overpass instance is unavailable", async () => {
    const fetchSpy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("busy", { status: 503, statusText: "Service Unavailable" }))
      .mockResolvedValueOnce(new Response(JSON.stringify(makeResponse("滨江步道")), { status: 200 }));

    const provider = new OverpassPoiProvider([
      "https://primary.example/api/interpreter",
      "https://secondary.example/api/interpreter"
    ]);

    const result = await provider.searchRunPois(location, 5000);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("滨江步道");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://primary.example/api/interpreter");
    expect(fetchSpy.mock.calls[1]?.[0]).toBe("https://secondary.example/api/interpreter");
  });

  it("queries expanded running tags and normalizes named footways and stadiums", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(makeRunResponse()), { status: 200 })
    );

    const provider = new OverpassPoiProvider(["https://overpass.example/api/interpreter"]);
    const result = await provider.searchRunPois(secondaryLocation, 5000);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = String(init.body);

    expect(body).toContain('"leisure"="pitch"');
    expect(body).toContain('"leisure"="sports_centre"');
    expect(body).toContain('"leisure"="stadium"');
    expect(body).toContain('"highway"~"^(footway|path|pedestrian)$"');
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("校园操场");
    expect(result[0]?.source).toBe("overpass");
    expect(result[0]?.matchReason).toBe("tag:leisure=stadium");
    expect(result[1]?.terrains).toContain("park");
    expect(result[1]?.matchReason).toBe("tag:highway=footway");
  });

  it("returns stale cached results when upstream later fails", async () => {
    const fetchSpy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(makeResponse("世纪公园", 35.231, 118.474)), { status: 200 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }));

    const provider = new OverpassPoiProvider(["https://cache-test.example/api/interpreter"]);
    const firstLocation = { latitude: 35.2304, longitude: 118.4737 };
    const secondLocation = { latitude: 35.23041, longitude: 118.47369 };
    const first = await provider.searchRunPois(firstLocation, 5000);
    const second = await provider.searchRunPois(secondLocation, 5000);

    expect(first.length).toBe(1);
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
