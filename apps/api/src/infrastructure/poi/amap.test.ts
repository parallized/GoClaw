import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { AmapPoiProvider } from "./amap";

const location = { latitude: 31.2304, longitude: 121.4737 };
const photoLocation = { latitude: 31.2314, longitude: 121.4747 };
const firstLocation = { latitude: 35.2304, longitude: 118.4737 };
const secondLocation = { latitude: 35.23041, longitude: 118.47369 };
const limitLocation = { latitude: 31.2404, longitude: 121.4837 };

describe("AmapPoiProvider", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  it("normalizes and deduplicates run POIs from Amap around search", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords");

      if (keyword === "公园") {
        return Promise.resolve(new Response(JSON.stringify({
          status: "1",
          info: "OK",
          pois: [
            {
              id: "B001",
              name: "世纪公园",
              location: "121.474,31.231",
              distance: "120",
              type: "风景名胜;公园广场;公园",
              typecode: "110101",
              cityname: "上海市",
              adname: "浦东新区",
              address: "锦绣路1001号"
            }
          ]
        }), { status: 200 }));
      }

      if (keyword === "绿道") {
        return Promise.resolve(new Response(JSON.stringify({
          status: "1",
          info: "OK",
          pois: [
            {
              id: "B002",
              name: "世纪公园",
              location: "121.474,31.231",
              distance: "130",
              type: "风景名胜;公园广场;公园",
              typecode: "110101",
              cityname: "上海市",
              adname: "浦东新区",
              address: "锦绣路1001号"
            },
            {
              id: "B003",
              name: "滨江步道",
              location: "121.476,31.232",
              distance: "260",
              type: "风景名胜;公园广场;公园",
              typecode: "110101",
              cityname: "上海市",
              adname: "浦东新区",
              address: "滨江大道"
            }
          ]
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({
        status: "1",
        info: "OK",
        pois: []
      }), { status: 200 }));
    });

    const provider = new AmapPoiProvider({ key: "test-key" });
    const result = await provider.searchRunPois(limitLocation, 5100);

    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("世纪公园");
    expect(result[0]?.terrains).toContain("park");
    expect(result[1]?.name).toBe("滨江步道");
    expect(result[1]?.terrains).toContain("waterfront");
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("normalizes photo POIs into photography themes", async () => {
    spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords");

      if (keyword === "博物馆") {
        return Promise.resolve(new Response(JSON.stringify({
          status: "1",
          info: "OK",
          pois: [
            {
              id: "P001",
              name: "上海博物馆",
              location: "121.475,31.229",
              distance: "150",
              type: "科教文化服务;博物馆;博物馆",
              typecode: "140500",
              cityname: "上海市",
              adname: "黄浦区",
              address: "人民大道201号"
            }
          ]
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({
        status: "1",
        info: "OK",
        pois: []
      }), { status: 200 }));
    });

    const provider = new AmapPoiProvider({ key: "test-key" });
    const result = await provider.searchPhotoPois(photoLocation, 8000);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("上海博物馆");
    expect(result[0]?.themes).toContain("humanity");
    expect(result[0]?.themes).toContain("architecture");
  });

  it("maps Amap quota errors to a user-friendly 429 error", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      status: "0",
      info: "DAILY_QUERY_OVER_LIMIT",
      infocode: "10003"
    }), { status: 200 }));

    const provider = new AmapPoiProvider({ key: "test-key" });
    await expect(provider.searchRunPois(limitLocation, 5000)).rejects.toMatchObject({
      status: 429,
      message: "地点服务当前较繁忙，请稍后重试。"
    });
  });

  it("returns accumulated POIs when a later keyword hits quota limits", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords");

      if (keyword === "公园") {
        return Promise.resolve(new Response(JSON.stringify({
          status: "1",
          info: "OK",
          pois: [
            {
              id: "B201",
              name: "人民公园",
              location: "121.474,31.231",
              distance: "120",
              type: "风景名胜;公园广场;公园",
              typecode: "110101",
              cityname: "上海市",
              adname: "黄浦区",
              address: "南京西路231号"
            }
          ]
        }), { status: 200 }));
      }

      if (keyword === "绿道") {
        return Promise.resolve(new Response(JSON.stringify({
          status: "0",
          info: "DAILY_QUERY_OVER_LIMIT",
          infocode: "10003"
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({
        status: "1",
        info: "OK",
        pois: []
      }), { status: 200 }));
    });

    const provider = new AmapPoiProvider({ key: "test-key" });
    const result = await provider.searchRunPois(location, 5000);

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("人民公园");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns cached results for equivalent rounded coordinates", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords");

      if (keyword === "公园") {
        return Promise.resolve(new Response(JSON.stringify({
          status: "1",
          info: "OK",
          pois: [
            {
              id: "B100",
              name: "人民公园",
              location: "118.474,35.231",
              distance: "180",
              type: "风景名胜;公园广场;公园",
              typecode: "110101",
              cityname: "临沂市",
              adname: "兰山区",
              address: "解放路"
            }
          ]
        }), { status: 200 }));
      }

      return Promise.resolve(new Response(JSON.stringify({
        status: "1",
        info: "OK",
        pois: []
      }), { status: 200 }));
    });

    const provider = new AmapPoiProvider({ key: "test-key" });
    const first = await provider.searchRunPois(firstLocation, 5000);
    const second = await provider.searchRunPois(secondLocation, 5000);

    expect(first.length).toBe(1);
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });
});
