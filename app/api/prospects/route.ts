import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, listProspects } from "@/lib/supabase";
import { getPlaceDetails } from "@/lib/googlePlaces";
import type { Prospect } from "@/lib/types";

export async function GET(req: NextRequest) {
  const stage = req.nextUrl.searchParams.get("stage") ?? undefined;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");
  const prospects = await listProspects(stage, limit);
  return NextResponse.json(prospects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const googlePlaceId = typeof body.google_place_id === "string" ? body.google_place_id : "";
  const sessionToken = typeof body.places_session_token === "string" ? body.places_session_token : undefined;

  if (!googlePlaceId) {
    return NextResponse.json(
      { error: "Select a real address from Google Places before saving." },
      { status: 400 }
    );
  }

  let place;
  try {
    place = await getPlaceDetails(googlePlaceId, sessionToken);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify Google Place" },
      { status: 422 }
    );
  }

  if (!place.isStreetAddress) {
    return NextResponse.json(
      { error: "Select a specific street address, not a city or broad area." },
      { status: 400 }
    );
  }

  if (place.province && place.province !== "ON") {
    return NextResponse.json(
      { error: "Select an Ontario address for this pipeline." },
      { status: 400 }
    );
  }

  const insert: Partial<Prospect> = {
    company_name: stringValue(body.company_name),
    address: place.streetAddress,
    city: place.city,
    lat: place.lat,
    lng: place.lng,
    sqft: numberValue(body.sqft),
    year_built: numberValue(body.year_built),
    industry: nullableString(body.industry),
    owner_name: nullableString(body.owner_name),
    owner_title: nullableString(body.owner_title),
    owner_email: nullableString(body.owner_email),
    owner_mobile: nullableString(body.owner_mobile),
  };

  if (!insert.company_name || !insert.address || !insert.city) {
    return NextResponse.json(
      { error: "Company name and verified address are required." },
      { status: 400 }
    );
  }

  const slug = generateSlug(insert.company_name, insert.city);

  const { data, error } = await supabaseAdmin()
    .from("prospects")
    .insert({
      ...insert,
      slug,
      stage: "sourced",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

function generateSlug(companyName: string, city: string): string {
  const base = `${companyName}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  const next = stringValue(value);
  return next || null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
