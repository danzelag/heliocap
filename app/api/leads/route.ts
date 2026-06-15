import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Prospect } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (stringValue(body.website)) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const contactName = stringValue(body.contact_name);
  const address = stringValue(body.address);
  const city = stringValue(body.city) || "Ontario";

  if (!contactName || !address) {
    return NextResponse.json({ error: "Name and address are required." }, { status: 400 });
  }

  const interestedSolar = booleanValue(body.interested_solar, true);
  const interestedHeatPump = booleanValue(body.interested_heat_pump, false);
  const interestedEv = booleanValue(body.interested_ev, false);
  const consent = booleanValue(body.insurance_quote_consent, false);

  const insert: Partial<Prospect> = {
    proposal_type: "residential",
    company_name: null,
    contact_name: contactName,
    owner_name: contactName,
    owner_email: nullableString(body.owner_email),
    owner_mobile: nullableString(body.owner_mobile),
    address,
    city,
    monthly_energy_bill: numberValue(body.monthly_energy_bill),
    interested_solar: interestedSolar,
    interested_heat_pump: interestedHeatPump,
    interested_ev: interestedEv,
    include_solar: interestedSolar,
    include_heat_pump: interestedHeatPump,
    include_ev: interestedEv,
    insurance_quote_consent: consent,
    insurance_consent_at: consent ? new Date().toISOString() : null,
  };

  const { data, error } = await supabaseAdmin()
    .from("prospects")
    .insert({
      ...insert,
      slug: generateSlug(contactName, city),
      stage: "sourced",
    })
    .select()
    .single();

  if (error) {
    if (isMissingRestructureColumn(error)) {
      return insertLegacyResidentialLead({
        contactName,
        address,
        city,
        email: nullableString(body.owner_email),
        mobile: nullableString(body.owner_mobile),
        monthlyBill: numberValue(body.monthly_energy_bill),
        interestedSolar,
        interestedHeatPump,
        interestedEv,
        consent,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ prospect: data }, { status: 201 });
}

async function insertLegacyResidentialLead({
  contactName,
  address,
  city,
  email,
  mobile,
  monthlyBill,
  interestedSolar,
  interestedHeatPump,
  interestedEv,
  consent,
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
  consent: boolean;
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
        `Insurance consent: ${consent ? "yes" : "no"}`,
      ]
        .filter(Boolean)
        .join(" | "),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ prospect: data, storage: "legacy" }, { status: 201 });
}

function generateSlug(name: string, city: string): string {
  const base = `${name}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "homeowner"}-${suffix}`;
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

function isMissingRestructureColumn(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.message?.includes("proposal_type") || error.message?.includes("schema cache") || false;
}
