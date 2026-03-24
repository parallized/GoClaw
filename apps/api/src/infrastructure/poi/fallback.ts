import type { Coordinates } from "@goplan/contracts";
import type { PoiProvider, PointOfInterest } from "../../domain/service-types";
import { shouldFallbackFromPrimary } from "../amap/web-service";

export class FallbackPoiProvider implements PoiProvider {
  readonly name: string;

  constructor(
    private readonly primary: PoiProvider,
    private readonly fallback: PoiProvider
  ) {
    this.name = `${primary.name}+${fallback.name}`;
  }

  async searchRunPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]> {
    try {
      return await this.primary.searchRunPois(location, radiusMeters);
    } catch (error) {
      if (!shouldFallbackFromPrimary(error)) {
        throw error;
      }

      return await this.fallback.searchRunPois(location, radiusMeters);
    }
  }

  async searchPhotoPois(location: Coordinates, radiusMeters: number): Promise<PointOfInterest[]> {
    try {
      return await this.primary.searchPhotoPois(location, radiusMeters);
    } catch (error) {
      if (!shouldFallbackFromPrimary(error)) {
        throw error;
      }

      return await this.fallback.searchPhotoPois(location, radiusMeters);
    }
  }
}
