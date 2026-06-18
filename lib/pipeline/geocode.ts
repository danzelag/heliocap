import type { PipelineResult } from "../types";
import { googleApiError, requireGoogleMapsServerKey } from "../googleApi";

export interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export async function geocodeAddress(
  address: string
): Promise<PipelineResult<GeocodeResult>> {
  const encoded = encodeURIComponent(address);
  const key = requireGoogleMapsServerKey();
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    return { ok: false, error: await googleApiError(res, "Geocoding") };
  }
  const json = await res.json();

  if (json.status !== "OK" || !json.results?.[0]) {
    return { ok: false, error: `Geocoding failed: ${json.status}` };
  }

  const loc = json.results[0].geometry.location;
  return {
    ok: true,
    data: {
      lat: loc.lat,
      lng: loc.lng,
      formattedAddress: json.results[0].formatted_address,
    },
  };
}

export function qualifyProspect(prospect: {
  sqft: number | null;
  year_built: number | null;
  city: string;
}): { pass: boolean; reason?: string } {
  if (!prospect.sqft || prospect.sqft < 10_000) {
    return { pass: false, reason: `sqft ${prospect.sqft} < 10,000` };
  }
  const currentYear = new Date().getFullYear();
  const roofAge = prospect.year_built ? currentYear - prospect.year_built : null;
  if (!roofAge || roofAge < 20) {
    return {
      pass: false,
      reason: `year_built ${prospect.year_built} — roof not yet at replacement window`,
    };
  }
  return { pass: true };
}
