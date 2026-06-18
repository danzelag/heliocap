import type { PipelineResult } from "../types";
import { supabaseAdmin } from "../supabase";
import { googleApiError, googleMapsServerKey } from "../googleApi";

export interface SatelliteResult {
  imageUrl: string;
  squareUrl: string;
}

export async function fetchSatelliteImage(
  lat: number,
  lng: number,
  sqft: number,
  prospectId: string
): Promise<PipelineResult<SatelliteResult>> {
  const key = googleMapsServerKey();
  if (!key) {
    return { ok: false, error: "GOOGLE_MAPS_SERVER_API_KEY or GOOGLE_MAPS_API_KEY is not configured." };
  }
  const zoom = sqft >= 200_000 ? 17 : 18;

  const [wide, square] = await Promise.all([
    fetchAndUpload(
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=1280x720&maptype=satellite&key=${key}`,
      `satellites/${prospectId}/16x9.png`
    ),
    fetchAndUpload(
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=720x720&maptype=satellite&key=${key}`,
      `satellites/${prospectId}/1x1.png`
    ),
  ]);

  if (!wide.url || !square.url) {
    return { ok: false, error: wide.error ?? square.error ?? "Failed to fetch or upload satellite images" };
  }

  return { ok: true, data: { imageUrl: wide.url, squareUrl: square.url } };
}

async function fetchAndUpload(
  googleUrl: string,
  storagePath: string
): Promise<{ url: string | null; error: string | null }> {
  const res = await fetch(googleUrl);
  if (!res.ok) {
    return { url: null, error: await googleApiError(res, "Static Maps satellite") };
  }
  const buffer = await res.arrayBuffer();

  const { error } = await supabaseAdmin().storage
    .from("openclaw")
    .upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) return { url: null, error: error.message };

  const { data } = supabaseAdmin().storage
    .from("openclaw")
    .getPublicUrl(storagePath);

  return { url: data.publicUrl, error: null };
}
