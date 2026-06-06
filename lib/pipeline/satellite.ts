import type { PipelineResult } from "../types";
import { supabaseAdmin } from "../supabase";

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
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const zoom = sqft >= 200_000 ? 17 : 18;

  const [wideUrl, squareUrl] = await Promise.all([
    fetchAndUpload(
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=1280x720&maptype=satellite&key=${key}`,
      `satellites/${prospectId}/16x9.png`
    ),
    fetchAndUpload(
      `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=720x720&maptype=satellite&key=${key}`,
      `satellites/${prospectId}/1x1.png`
    ),
  ]);

  if (!wideUrl || !squareUrl) {
    return { ok: false, error: "Failed to fetch or upload satellite images" };
  }

  return { ok: true, data: { imageUrl: wideUrl, squareUrl } };
}

async function fetchAndUpload(
  googleUrl: string,
  storagePath: string
): Promise<string | null> {
  const res = await fetch(googleUrl);
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();

  const { error } = await supabaseAdmin().storage
    .from("openclaw")
    .upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) return null;

  const { data } = supabaseAdmin().storage
    .from("openclaw")
    .getPublicUrl(storagePath);

  return data.publicUrl;
}
