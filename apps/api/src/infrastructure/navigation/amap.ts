import type { Coordinates } from "@goplan/contracts";
import type { NavigationProvider } from "../../domain/service-types";

export class AmapNavigationProvider implements NavigationProvider {
  readonly name = "amap";

  buildNavigationUrl(destination: Coordinates, label: string): string {
    const name = encodeURIComponent(label);
    return `https://uri.amap.com/navigation?to=${destination.longitude},${destination.latitude},${name}&mode=walk&src=goplan&coordinate=gaode&callnative=0`;
  }
}
