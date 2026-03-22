import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { NominatimGeocodingProvider } from "./nominatim";

const location = { latitude: 31.2304, longitude: 121.4737, label: "上海 · 黄浦" };
const fallbackLocation = { latitude: 31.2305, longitude: 121.4738, label: "上海 · 黄浦" };
const dedupeLocation = { latitude: 31.2306, longitude: 121.4739, label: "上海 · 黄浦" };

describe("NominatimGeocodingProvider", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  it("returns formatted place summary from Nominatim", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      display_name: "上海市黄浦区",
      address: {
        city: "上海",
        suburb: "黄浦"
      }
    }), { status: 200 }));

    const provider = new NominatimGeocodingProvider();
    await expect(provider.reverseGeocode(location)).resolves.toEqual({
      city: "上海",
      district: "黄浦",
      displayName: "上海市黄浦区"
    });
  });

  it("falls back to location label when upstream fails", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response("rate limited", { status: 429, statusText: "Too Many Requests" }));

    const provider = new NominatimGeocodingProvider();
    await expect(provider.reverseGeocode(fallbackLocation)).resolves.toEqual({
      city: "上海",
      district: "黄浦",
      displayName: "上海 · 黄浦"
    });
  });

  it("deduplicates concurrent requests for the same coordinates", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }) as Promise<Response>);

    const provider = new NominatimGeocodingProvider();
    const first = provider.reverseGeocode(dedupeLocation);
    const second = provider.reverseGeocode(dedupeLocation);

    resolveFetch?.(new Response(JSON.stringify({
      display_name: "上海市黄浦区",
      address: {
        city: "上海",
        suburb: "黄浦"
      }
    }), { status: 200 }));

    await expect(first).resolves.toEqual({
      city: "上海",
      district: "黄浦",
      displayName: "上海市黄浦区"
    });
    await expect(second).resolves.toEqual({
      city: "上海",
      district: "黄浦",
      displayName: "上海市黄浦区"
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
