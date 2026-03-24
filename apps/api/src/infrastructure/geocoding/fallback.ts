import type { Coordinates } from "@goplan/contracts";
import type { GeocodingProvider, PlaceSummary } from "../../domain/service-types";
import { shouldFallbackFromPrimary } from "../amap/web-service";

export class FallbackGeocodingProvider implements GeocodingProvider {
  readonly name: string;

  constructor(
    private readonly primary: GeocodingProvider,
    private readonly fallback: GeocodingProvider
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async reverseGeocode(location: Coordinates): Promise<PlaceSummary> {
    try {
      return await this.primary.reverseGeocode(location);
    } catch (error) {
      if (!shouldFallbackFromPrimary(error)) {
        throw error;
      }

      return await this.fallback.reverseGeocode(location);
    }
  }
}
