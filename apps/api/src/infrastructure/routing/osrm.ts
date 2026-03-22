import type { Coordinates } from "@goplan/contracts";
import type { RoutePlan, RoutingProvider } from "../../domain/service-types";
import { AppError } from "../../lib/errors";
import { fetchJson } from "../../lib/http";

interface OsrmResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
  }>;
}

export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = "osrm";

  async getWalkingRoute(from: Coordinates, to: Coordinates): Promise<RoutePlan> {
    const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
    const response = await fetchJson<OsrmResponse>(`https://router.project-osrm.org/route/v1/foot/${coords}?overview=false&alternatives=false&steps=false`, {
      timeoutMs: 20_000
    });

    const route = response.routes?.[0];
    if (response.code !== "Ok" || !route) {
      throw new AppError("路径服务暂时无法返回有效路线", 502);
    }

    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      source: this.name
    };
  }
}
