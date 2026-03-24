import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { AmapGeocodingProvider } from "./amap";

const location = { latitude: 31.2304, longitude: 121.4737, label: "上海 · 黄浦" };
const municipalityLocation = { latitude: 39.9042, longitude: 116.4074, label: "北京 · 朝阳" };
const dedupeLocation = { latitude: 31.2306, longitude: 121.4739, label: "上海 · 黄浦" };
const limitLocation = { latitude: 31.2308, longitude: 121.4741, label: "上海 · 黄浦" };

describe("AmapGeocodingProvider", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  it("returns formatted place summary from Amap reverse geocoding", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "1",
      info: "OK",
      regeocode: {
        formatted_address: "上海市黄浦区南京东路街道",
        addressComponent: {
          city: "上海市",
          district: "黄浦区",
          province: "上海市"
        }
      }
    }), { status: 200 }));

    const provider = new AmapGeocodingProvider({ key: "test-key" });
    await expect(provider.reverseGeocode(location)).resolves.toEqual({
      city: "上海市",
      district: "黄浦区",
      displayName: "上海市黄浦区南京东路街道"
    });
  });

  it("falls back to province when municipality city field is empty", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "1",
      info: "OK",
      regeocode: {
        formatted_address: "北京市朝阳区建国门外大街",
        addressComponent: {
          city: [],
          district: "朝阳区",
          province: "北京市"
        }
      }
    }), { status: 200 }));

    const provider = new AmapGeocodingProvider({ key: "test-key" });
    await expect(provider.reverseGeocode(municipalityLocation)).resolves.toEqual({
      city: "北京市",
      district: "朝阳区",
      displayName: "北京市朝阳区建国门外大街"
    });
  });

  it("deduplicates concurrent requests for the same coordinates", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }) as Promise<Response>);

    const provider = new AmapGeocodingProvider({ key: "test-key" });
    const first = provider.reverseGeocode(dedupeLocation);
    const second = provider.reverseGeocode(dedupeLocation);

    resolveFetch?.(new Response(JSON.stringify({
      status: "1",
      info: "OK",
      regeocode: {
        formatted_address: "上海市黄浦区",
        addressComponent: {
          city: "上海市",
          district: "黄浦区",
          province: "上海市"
        }
      }
    }), { status: 200 }));

    await expect(first).resolves.toEqual({
      city: "上海市",
      district: "黄浦区",
      displayName: "上海市黄浦区"
    });
    await expect(second).resolves.toEqual({
      city: "上海市",
      district: "黄浦区",
      displayName: "上海市黄浦区"
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("maps Amap quota errors to a user-friendly 429 error", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "0",
      info: "DAILY_QUERY_OVER_LIMIT",
      infocode: "10003"
    }), { status: 200 }));

    const provider = new AmapGeocodingProvider({ key: "test-key" });
    await expect(provider.reverseGeocode(limitLocation)).rejects.toMatchObject({
      status: 429,
      message: "地点服务当前较繁忙，请稍后重试。"
    });
  });
});
