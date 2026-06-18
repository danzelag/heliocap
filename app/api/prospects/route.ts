import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { supabaseAdmin, listProspects } from "@/lib/supabase";
import { getPlaceDetails } from "@/lib/googlePlaces";
import type { ProposalType, Prospect } from "@/lib/types";

export async function GET(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const stage = req.nextUrl.searchParams.get("stage") ?? undefined;
  const proposalType = parseProposalType(req.nextUrl.searchParams.get("proposal_type"));
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50");
  const prospects = await listProspects(stage, limit, proposalType);
  return NextResponse.json(prospects);
}

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const body = await req.json();
  const proposalType = parseProposalType(body.proposal_type) ?? "commercial";

  if (proposalType === "residential") {
    return createResidentialProspect(body);
  }

  return createCommercialProspect(body);
}

async function createCommercialProspect(body: Record<string, unknown>) {
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
    proposal_type: "commercial",
    company_name: stringValue(body.company_name),
    contact_name: nullableString(body.contact_name),
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
    include_solar: booleanValue(body.include_solar, true),
    include_ev: booleanValue(body.include_ev, false),
    include_heat_pump: false,
    ev_charger_count: numberValue(body.ev_charger_count),
    ev_charger_annual_value: numberValue(body.ev_charger_annual_value),
    ev_charger_notes: nullableString(body.ev_charger_notes),
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

async function insertLegacyResidentialProspect({
  contactName,
  address,
  city,
  email,
  mobile,
  monthlyBill,
  interestedSolar,
  interestedHeatPump,
  interestedEv,
  insuranceConsent,
}: {
  contactName: string;
  address: string;
  city: string;
  email: string | null;
  mobile: string | null;
  monthlyBill: number | null;
  interestedSolar: boolean;
  interestedHeatPump: boolean;
  interestedEv: boolean;
  insuranceConsent: boolean;
}) {
  const interests = [
    interestedSolar ? "solar" : null,
    interestedHeatPump ? "heat pump" : null,
    interestedEv ? "EV charger" : null,
  ].filter(Boolean);

  const { data, error } = await supabaseAdmin()
    .from("prospects")
    .insert({
      slug: generateSlug(contactName, city),
      stage: "sourced",
      company_name: contactName,
      address,
      city,
      owner_name: contactName,
      owner_title: "Residential lead",
      owner_email: email,
      owner_mobile: mobile,
      industry: [
        "Residential",
        interests.length ? `Interests: ${interests.join(", ")}` : null,
        monthlyBill ? `Monthly bill: $${monthlyBill}` : null,
        `Insurance consent: ${insuranceConsent ? "yes" : "no"}`,
      ]
        .filter(Boolean)
        .join(" | "),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

async function createResidentialProspect(body: Record<string, unknown>) {
  const contactName = stringValue(body.contact_name);
  const address = stringValue(body.address);
  const city = stringValue(body.city) || "Ontario";

  if (!contactName || !address) {
    return NextResponse.json(
      { error: "Homeowner name and address are required." },
      { status: 400 }
    );
  }

  const interestedSolar = booleanValue(body.interested_solar, true);
  const interestedHeatPump = booleanValue(body.interested_heat_pump, false);
  const interestedEv = booleanValue(body.interested_ev, false);
  const insuranceConsent = booleanValue(body.insurance_quote_consent, false);

  const insert: Partial<Prospect> = {
    proposal_type: "residential",
    company_name: null,
    contact_name: contactName,
    address,
    city,
    owner_name: contactName,
    owner_email: nullableString(body.owner_email),
    owner_mobile: nullableString(body.owner_mobile),
    monthly_energy_bill: numberValue(body.monthly_energy_bill),
    interested_solar: interestedSolar,
    interested_heat_pump: interestedHeatPump,
    interested_ev: interestedEv,
    include_solar: booleanValue(body.include_solar, interestedSolar),
    include_heat_pump: booleanValue(body.include_heat_pump, interestedHeatPump),
    include_ev: booleanValue(body.include_ev, interestedEv),
    insurance_quote_consent: insuranceConsent,
    insurance_consent_at: insuranceConsent ? new Date().toISOString() : null,
  };

  const slug = generateSlug(contactName, city);

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
    if (isMissingRestructureColumn(error)) {
      return insertLegacyResidentialProspect({
        contactName,
        address,
        city,
        email: nullableString(body.owner_email),
        mobile: nullableString(body.owner_mobile),
        monthlyBill: numberValue(body.monthly_energy_bill),
        interestedSolar,
        interestedHeatPump,
        interestedEv,
        insuranceConsent,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (!ids.length) {
    return NextResponse.json({ error: "Select at least one prospect to delete." }, { status: 400 });
  }

  const uniqueIds = Array.from(new Set(ids));
  const { data, error } = await supabaseAdmin()
    .from("prospects")
    .delete()
    .in("id", uniqueIds)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    deletedIds: data?.map((row) => row.id) ?? [],
  });
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

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "on", "1", "yes"].includes(value.toLowerCase())) return true;
    if (["false", "off", "0", "no"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function parseProposalType(value: unknown): ProposalType | undefined {
  return value === "residential" || value === "commercial" ? value : undefined;
}

function isMissingRestructureColumn(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.message?.includes("proposal_type") || error.message?.includes("schema cache") || false;
}
