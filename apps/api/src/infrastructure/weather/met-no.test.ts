import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { MetNoWeatherProvider } from "./met-no";

function createMetNoResponse() {
  return {
    properties: {
      timeseries: [
        {
          time: "2026-04-07T00:00:00Z",
          data: {
            instant: {
              details: {
                air_temperature: 18,
                cloud_area_fraction: 75,
                wind_speed: 4
              }
            },
            next_1_hours: {
              summary: {
                symbol_code: "lightrain"
              },
              details: {
                precipitation_amount: 0.5
              }
            }
          }
        },
        {
          time: "2026-04-07T04:00:00Z",
          data: {
            instant: {
              details: {
                air_temperature: 24,
                cloud_area_fraction: 20,
                wind_speed: 2
              }
            },
            next_1_hours: {
              summary: {
                symbol_code: "fair_day"
              },
              details: {
                precipitation_amount: 0
              }
            }
          }
        }
      ]
    }
  };
}

describe("MetNoWeatherProvider", () => {
  afterEach(() => {
    mock.restore();
  });

  it("requests compact forecast with latitude and longitude", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(createMetNoResponse()), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const provider = new MetNoWeatherProvider();
    await provider.getForecast({
      latitude: 30.2251,
      longitude: 120.0191
    }, "Asia/Shanghai", 2);

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const requestUrl = new URL(url);
    expect(requestUrl.hostname).toBe("api.met.no");
    expect(requestUrl.searchParams.get("lat")).toBe("30.2251");
    expect(requestUrl.searchParams.get("lon")).toBe("120.0191");
  });

  it("normalizes UTC times into the requested timezone and aggregates daily weather", async () => {
    spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(createMetNoResponse()), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    const provider = new MetNoWeatherProvider();
    const forecast = await provider.getForecast({
      latitude: 30.2251,
      longitude: 120.0191
    }, "Asia/Shanghai", 2);

    expect(forecast.timezone).toBe("Asia/Shanghai");
    expect(forecast.hourly[0]?.time).toBe("2026-04-07T08:00");
    expect(forecast.hourly[0]?.windSpeedKmh).toBe(14.4);
    expect(forecast.hourly[0]?.precipitationProbability).toBeGreaterThan(0);
    expect(forecast.daily[0]?.date).toBe("2026-04-07");
    expect(forecast.daily[0]?.temperatureMaxC).toBe(24);
    expect(forecast.daily[0]?.temperatureMinC).toBe(18);
  });
});
