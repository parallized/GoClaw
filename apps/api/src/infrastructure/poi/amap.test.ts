import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { AmapPoiProvider } from "./amap";

const location = { latitude: 31.2304, longitude: 121.4737 };
const photoLocation = { latitude: 31.2314, longitude: 121.4747 };
const firstLocation = { latitude: 35.2304, longitude: 118.4737 };
const secondLocation = { latitude: 35.23041, longitude: 118.47369 };
const limitLocation = { latitude: 31.2404, longitude: 121.4837 };
const runTypes = "110000|110101|080000|080100";

function ok(pois: unknown[]) {
  return Promise.resolve(new Response(JSON.stringify({
    status: "1",
    info: "OK",
    pois
  }), { status: 200 }));
}

describe("AmapPoiProvider", () => {
  beforeEach(() => {
    mock.restore();
  });

  afterEach(() => {
    mock.restore();
  });

  it("merges keyword and type queries while deduplicating nearby duplicate POIs", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords");
      const types = url.searchParams.get("types");
      const page = Number(url.searchParams.get("page") ?? "1");

      if (keyword === "公园" && page === 1) {
        return ok([
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
        ]);
      }

      if (types === runTypes && page === 1) {
        return ok([
          {
            id: "B002",
            name: "世纪公园",
            location: "121.47401,31.23101",
            distance: "121",
            type: "风景名胜;公园广场;公园",
            typecode: "110101",
            cityname: "上海市",
            adname: "浦东新区",
            address: "锦绣路1001号"
          },
          {
            id: "B003",
            name: "校园操场",
            location: "121.476,31.232",
            distance: "260",
            type: "体育休闲服务;运动场馆;体育场馆",
            typecode: "080100",
            cityname: "上海市",
            adname: "浦东新区",
            address: "滨江大道"
          }
        ]);
      }

      return ok([]);
    });

    const provider = new AmapPoiProvider({ key: "test-key" });
    const result = await provider.searchRunPois(limitLocation, 5101);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name)).toEqual(["世纪公园", "校园操场"]);
    expect(result[0]?.terrains).toContain("park");
    expect(result[1]?.terrains).toContain("track");
    expect(result[1]?.source).toBe("amap");
    expect(result[1]?.matchReason).toBe("types:run-core");
    expect(fetchSpy.mock.calls.some(([input]) => new URL(String(input)).searchParams.get("types") === runTypes)).toBe(true);
  });

  it("paginates Amap around search and stops early once enough run candidates are collected", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords");
      const page = Number(url.searchParams.get("page") ?? "1");

      if (keyword === "公园" && page === 1) {
        return ok(Array.from({ length: 20 }, (_, index) => ({
          id: `B-${index + 1}`,
          name: `口袋公园${index + 1}`,
          location: `121.${480 + index},31.${240 + index}`,
          distance: String(100 + index),
          type: "风景名胜;公园广场;公园",
          typecode: "110101",
          cityname: "上海市",
          adname: "浦东新区",
          address: "测试地址"
        })));
      }

      if (keyword === "公园" && page === 2) {
        return ok(Array.from({ length: 5 }, (_, index) => ({
          id: `B-2-${index + 1}`,
          name: `滨水绿地${index + 1}`,
          location: `121.${530 + index},31.${290 + index}`,
          distance: String(300 + index),
          type: "风景名胜;公园广场;公园",
          typecode: "110101",
          cityname: "上海市",
          adname: "浦东新区",
          address: "测试地址"
        })));
      }

      return ok([]);
    });

    const provider = new AmapPoiProvider({ key: "test-key" });
    const result = await provider.searchRunPois(limitLocation, 5102);

    expect(result).toHaveLength(25);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls.map(([input]) => Number(new URL(String(input)).searchParams.get("page")))).toEqual([1, 2]);
  });

  it("normalizes photo POIs into photography themes", async () => {
    spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords");

      if (keyword === "博物馆") {
        return ok([
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
        ]);
      }

      return ok([]);
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

  it("returns accumulated POIs when a later query hits quota limits", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords");
      const page = Number(url.searchParams.get("page") ?? "1");

      if (keyword === "公园" && page === 1) {
        return ok([
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
        ]);
      }

      if (keyword === "绿道" && page === 1) {
        return Promise.resolve(new Response(JSON.stringify({
          status: "0",
          info: "DAILY_QUERY_OVER_LIMIT",
          infocode: "10003"
        }), { status: 200 }));
      }

      return ok([]);
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
      const page = Number(url.searchParams.get("page") ?? "1");

      if (keyword === "公园" && page === 1) {
        return ok(Array.from({ length: 20 }, (_, index) => ({
          id: `B100-${index + 1}`,
          name: `人民公园${index + 1}`,
          location: `118.${474 + index},35.${231 + index}`,
          distance: String(180 + index),
          type: "风景名胜;公园广场;公园",
          typecode: "110101",
          cityname: "临沂市",
          adname: "兰山区",
          address: "解放路"
        })));
      }

      if (keyword === "公园" && page === 2) {
        return ok(Array.from({ length: 5 }, (_, index) => ({
          id: `B100-2-${index + 1}`,
          name: `人民绿地${index + 1}`,
          location: `118.${494 + index},35.${251 + index}`,
          distance: String(220 + index),
          type: "风景名胜;公园广场;公园",
          typecode: "110101",
          cityname: "临沂市",
          adname: "兰山区",
          address: "解放路"
        })));
      }

      return ok([]);
    });

    const provider = new AmapPoiProvider({ key: "test-key" });
    const first = await provider.searchRunPois(firstLocation, 5000);
    const second = await provider.searchRunPois(secondLocation, 5000);

    expect(first.length).toBe(25);
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
