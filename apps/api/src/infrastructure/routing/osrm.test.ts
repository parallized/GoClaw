import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { OsrmRoutingProvider } from "./osrm";

const from = { latitude: 31.2304, longitude: 121.4737 };
const to = { latitude: 31.2404, longitude: 121.4837 };

describe("OsrmRoutingProvider", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  it("maps 429 to a user-friendly 503 error", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }));

    const provider = new OsrmRoutingProvider();
    await expect(provider.getWalkingRoute(from, to)).rejects.toMatchObject({
      status: 503,
      message: "路径服务当前较繁忙，请稍后重试。"
    });
  });

  it("reuses cached route results for nearby identical coordinates", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      code: "Ok",
      routes: [{
        distance: 1200,
        duration: 900
      }]
    }), { status: 200 }));

    const provider = new OsrmRoutingProvider();
    const first = await provider.getWalkingRoute(from, to);
    const second = await provider.getWalkingRoute(
      { latitude: 31.23041, longitude: 121.47369 },
      { latitude: 31.24039, longitude: 121.48371 }
    );

    expect(first).toEqual(second);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
