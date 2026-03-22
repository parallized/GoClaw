import type { Coordinates } from "@goplan/contracts";
import type { GeocodingProvider, PlaceSummary } from "../../domain/service-types";
import { fetchJson } from "../../lib/http";

interface NominatimResponse {
  display_name: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    suburb?: string;
    city_district?: string;
    state?: string;
  };
}

export class NominatimGeocodingProvider implements GeocodingProvider {
  readonly name = "nominatim";

  async reverseGeocode(location: Coordinates): Promise<PlaceSummary> {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(location.latitude),
      lon: String(location.longitude),
      zoom: "14",
      addressdetails: "1"
    });

    const response = await fetchJson<NominatimResponse>(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
    const city = response.address?.city ?? response.address?.town ?? response.address?.village ?? response.address?.county ?? response.address?.state ?? "当前位置";
    const district = response.address?.suburb ?? response.address?.city_district;

    return {
      city,
      district,
      displayName: response.display_name
    };
  }
}
