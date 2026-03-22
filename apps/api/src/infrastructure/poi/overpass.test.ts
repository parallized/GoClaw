import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { OverpassPoiProvider } from "./overpass";

const location = { latitude: 31.2304, longitude: 121.4737 };

function makeResponse(name = "世纪公园") {
  return {
    elements: [
      {
        id: 1,
        type: "node",
        lat: 31.231,
        lon: 121.474,
        tags: {
          name,
          leisure: "park"
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

  it("returns stale cached results when upstream later fails", async () => {
    const fetchSpy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(makeResponse()), { status: 200 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }));

    const provider = new OverpassPoiProvider();
    const first = await provider.searchRunPois(location, 5000);
    const second = await provider.searchRunPois({ ...location, latitude: 31.23041, longitude: 121.47369 }, 5000);

    expect(first.length).toBe(1);
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
