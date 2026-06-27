import { NextRequest, NextResponse } from "next/server";
import { getPlaceDetails, googlePlacesRefererFromRequest } from "@/lib/googlePlaces";
import { rateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase";
import type { Prospect } from "@/lib/types";

const PROPERTY_TYPES = new Set([
  "Detached house",
  "Semi-detached",
  "Townhouse",
  "Condo",
  "Commercial / multi-unit",
]);

const HEATING_SYSTEMS = new Set([
  "Gas furnace",
  "Electric baseboards",
  "Oil furnace",
  "Propane",
  "Boiler / radiators",
  "Existing heat pump",
  "Not sure",
]);

const COOLING_SYSTEMS = new Set([
  "Central AC",
  "Ductless mini-split",
  "Window AC",
  "No AC",
  "Not sure",
]);

const DUCTWORK_OPTIONS = new Set([
  "I have existing ducts",
  "No ducts",
  "Not sure",
]);

const HOME_SIZES = new Set([
  "Under 1,000 sq ft",
  "1,000-1,500 sq ft",
  "1,500-2,000 sq ft",
  "2,000-3,000 sq ft",
  "3,000+ sq ft",
]);

const MAIN_GOALS = new Set([
  "Lower monthly bills",
  "Add AC",
  "Replace old furnace/AC",
  "Reduce gas use",
  "Improve comfort",
  "Add heating/cooling to specific rooms",
  "Pair with solar",
]);

const TIMELINES = new Set(["ASAP", "Within 1 month", "1-3 months", "Just researching"]);
const BILL_RANGES = new Set(["<$150", "$150-$250", "$250-$400", "$400+"]);
const REBATE_OPTIONS = new Set(["Interested in rebates", "Interested in financing", "Want both", "Not sure"]);
const EQUIPMENT_AGES = new Set(["Under 5 years", "5-10 years", "10-15 years", "15+ years", "Not sure"]);
const COMFORT_ISSUES = new Set(["No major issues", "One or two rooms", "Several rooms", "Whole home", "Not sure"]);
const PANEL_OPTIONS = new Set(["100A", "200A", "Not sure"]);
const OWNERSHIP_OPTIONS = new Set(["Own", "Rent"]);
const DECISION_OPTIONS = new Set(["Yes", "No", "Decision shared"]);
const SOLAR_STATUS_OPTIONS = new Set(["Already have solar", "Planning to install solar", "No solar yet", "Not sure"]);

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, "public-lead-submit", {
    limit: 8,
    windowMs: 10 * 60_000,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      }
    );
  }

  const body = await req.json().catch(() => ({}));

  if (stringValue(body.website)) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const contactName = stringValue(body.contact_name);
  const email = stringValue(body.owner_email).toLowerCase();
  const mobile = normalizePhone(stringValue(body.owner_mobile));
  const googlePlaceId = stringValue(body.google_place_id);
  const placesSessionToken = stringValue(body.places_session_token);

  if (!contactName) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!isValidPhone(mobile)) {
    return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
  }
  if (!googlePlaceId) {
    return NextResponse.json({ error: "Select a real address from Google Places." }, { status: 400 });
  }

  let place;
  try {
    place = await getPlaceDetails(googlePlaceId, placesSessionToken || undefined, {
      referer: googlePlacesRefererFromRequest(req),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not verify the selected address." },
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
    return NextResponse.json({ error: "Select an Ontario address for this program." }, { status: 400 });
  }

  const interestedSolar = booleanValue(body.interested_solar, true);
  const interestedHeatPump = booleanValue(body.interested_heat_pump, false);
  const interestedEv = booleanValue(body.interested_ev, false);
  if (!interestedSolar && !interestedHeatPump && !interestedEv) {
    return NextResponse.json({ error: "Select at least one upgrade." }, { status: 400 });
  }

  const evCount = interestedEv ? integerValue(body.ev_charger_count) : null;
  if (interestedEv && (!evCount || evCount < 1 || evCount > 10)) {
    return NextResponse.json({ error: "Select how many EVs you have or plan to buy." }, { status: 400 });
  }

  const mainGoals = arrayValue(body.main_goal).filter((value) => MAIN_GOALS.has(value));
  if (!mainGoals.length) {
    return NextResponse.json({ error: "Select your main goal." }, { status: 400 });
  }

  const lead = {
    propertyType: requiredOption(body.property_type, PROPERTY_TYPES, "property type"),
    heatingSystem: requiredOption(body.current_heating_system, HEATING_SYSTEMS, "heating system"),
    coolingSystem: requiredOption(body.current_cooling, COOLING_SYSTEMS, "cooling system"),
    ductwork: requiredOption(body.ductwork, DUCTWORK_OPTIONS, "ductwork"),
    homeSize: requiredOption(body.home_size, HOME_SIZES, "home size"),
    timeline: requiredOption(body.timeline, TIMELINES, "timeline"),
    gasBillRange: requiredOption(body.gas_bill_range, BILL_RANGES, "gas bill range"),
    hydroBillRange: requiredOption(body.hydro_bill_range, BILL_RANGES, "hydro bill range"),
    rebateFinancingInterest: requiredOption(body.rebate_financing_interest, REBATE_OPTIONS, "rebates or financing interest"),
    furnaceAcAge: requiredOption(body.furnace_ac_age, EQUIPMENT_AGES, "furnace or AC age"),
    comfortIssue: requiredOption(body.comfort_issue, COMFORT_ISSUES, "comfort issue"),
    electricalPanel: requiredOption(body.electrical_panel, PANEL_OPTIONS, "electrical panel"),
    ownershipStatus: requiredOption(body.ownership_status, OWNERSHIP_OPTIONS, "ownership status"),
    decisionMaker: requiredOption(body.decision_maker, DECISION_OPTIONS, "decision-maker status"),
    solarStatus: requiredOption(body.solar_status, SOLAR_STATUS_OPTIONS, "solar status"),
  };

  const invalid = Object.values(lead).find((value) => value.startsWith("INVALID:"));
  if (invalid) {
    return NextResponse.json({ error: `Select a valid ${invalid.replace("INVALID:", "")}.` }, { status: 400 });
  }

  const monthlyEnergyBill = monthlyBillEstimate(lead.gasBillRange, lead.hydroBillRange);
  const interests = [
    interestedSolar ? "Solar" : null,
    interestedHeatPump ? "Heat pump" : null,
    interestedEv ? "EV charger" : null,
  ].filter((value): value is string => Boolean(value));
  const leadNotes = [
    "Residential intake",
    `Products: ${interests.join(", ")}`,
    `Property: ${lead.propertyType}`,
    `Heating: ${lead.heatingSystem}`,
    `Cooling: ${lead.coolingSystem}`,
    `Ductwork: ${lead.ductwork}`,
    `Home size: ${lead.homeSize}`,
    `Goals: ${mainGoals.join(", ")}`,
    `Timeline: ${lead.timeline}`,
    `Gas bill: ${lead.gasBillRange}`,
    `Hydro bill: ${lead.hydroBillRange}`,
    `Rebates/financing: ${lead.rebateFinancingInterest}`,
    `Furnace/AC age: ${lead.furnaceAcAge}`,
    `Comfort: ${lead.comfortIssue}`,
    `Panel: ${lead.electricalPanel}`,
    `Ownership: ${lead.ownershipStatus}`,
    `Decision maker: ${lead.decisionMaker}`,
    `Solar status: ${lead.solarStatus}`,
    interestedEv && evCount ? `EVs: ${evCount}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  const insert: Partial<Prospect> = {
    proposal_type: "residential",
    company_name: null,
    contact_name: contactName,
    owner_name: contactName,
    owner_title: null,
    owner_email: email,
    owner_mobile: mobile,
    address: place.streetAddress,
    city: place.city || "Ontario",
    lat: place.lat,
    lng: place.lng,
    monthly_energy_bill: monthlyEnergyBill,
    interested_solar: interestedSolar,
    interested_heat_pump: interestedHeatPump,
    interested_ev: interestedEv,
    include_solar: interestedSolar,
    include_heat_pump: interestedHeatPump,
    include_ev: interestedEv,
    insurance_quote_consent: false,
    insurance_consent_at: null,
    property_type: lead.propertyType,
    current_heating_system: lead.heatingSystem,
    current_cooling: lead.coolingSystem,
    ductwork: lead.ductwork,
    home_size: lead.homeSize,
    main_goal: mainGoals.join(", "),
    timeline: lead.timeline,
    gas_bill_range: lead.gasBillRange,
    hydro_bill_range: lead.hydroBillRange,
    rebate_financing_interest: lead.rebateFinancingInterest,
    furnace_ac_age: lead.furnaceAcAge,
    comfort_issue: lead.comfortIssue,
    electrical_panel: lead.electricalPanel,
    ownership_status: lead.ownershipStatus,
    decision_maker: lead.decisionMaker,
    solar_status: lead.solarStatus,
    google_place_id: place.placeId,
    ev_charger_count: evCount,
    ev_charger_notes: interestedEv && evCount ? `${evCount} EV${evCount === 1 ? "" : "s"} now or planned` : null,
    industry: leadNotes,
  };

  const { data, error } = await supabaseAdmin()
    .from("prospects")
    .insert({
      ...insert,
      slug: generateSlug(contactName, place.city || "Ontario"),
      stage: "sourced",
    })
    .select()
    .single();

  if (error) {
    if (isMissingColumn(error)) {
      return insertLegacyResidentialLead({
        contactName,
        address: place.streetAddress,
        city: place.city || "Ontario",
        lat: place.lat,
        lng: place.lng,
        email,
        mobile,
        monthlyBill: monthlyEnergyBill,
        interestedSolar,
        interestedHeatPump,
        interestedEv,
        evCount,
        leadNotes,
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
  lat,
  lng,
  email,
  mobile,
  monthlyBill,
  interestedSolar,
  interestedHeatPump,
  interestedEv,
  evCount,
  leadNotes,
}: {
  contactName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  email: string;
  mobile: string;
  monthlyBill: number | null;
  interestedSolar: boolean;
  interestedHeatPump: boolean;
  interestedEv: boolean;
  evCount: number | null;
  leadNotes: string;
}) {
  const { data, error } = await supabaseAdmin()
    .from("prospects")
    .insert({
      slug: generateSlug(contactName, city),
      stage: "sourced",
      proposal_type: "residential",
      company_name: contactName,
      contact_name: contactName,
      address,
      city,
      lat,
      lng,
      owner_name: contactName,
      owner_title: null,
      owner_email: email,
      owner_mobile: mobile,
      monthly_energy_bill: monthlyBill,
      interested_solar: interestedSolar,
      interested_heat_pump: interestedHeatPump,
      interested_ev: interestedEv,
      include_solar: interestedSolar,
      include_heat_pump: interestedHeatPump,
      include_ev: interestedEv,
      ev_charger_count: evCount,
      ev_charger_notes: interestedEv && evCount ? `${evCount} EV${evCount === 1 ? "" : "s"} now or planned` : null,
      industry: leadNotes,
    })
    .select()
    .single();

  if (error) {
    if (isMissingColumn(error)) {
      return insertMinimalLegacyResidentialLead({
        contactName,
        address,
        city,
        lat,
        lng,
        email,
        mobile,
        leadNotes,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ prospect: data, storage: "legacy" }, { status: 201 });
}

async function insertMinimalLegacyResidentialLead({
  contactName,
  address,
  city,
  lat,
  lng,
  email,
  mobile,
  leadNotes,
}: {
  contactName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  email: string;
  mobile: string;
  leadNotes: string;
}) {
  const { data, error } = await supabaseAdmin()
    .from("prospects")
    .insert({
      slug: generateSlug(contactName, city),
      stage: "sourced",
      company_name: null,
      address,
      city,
      lat,
      lng,
      owner_name: contactName,
      owner_email: email,
      owner_mobile: mobile,
      industry: leadNotes,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ prospect: data, storage: "minimal-legacy" }, { status: 201 });
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

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim());
  const single = stringValue(value);
  return single ? [single] : [];
}

function integerValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "on", "1", "yes"].includes(value.toLowerCase())) return true;
    if (["false", "off", "0", "no"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

function requiredOption(value: unknown, allowed: Set<string>, label: string) {
  const next = stringValue(value);
  return next && allowed.has(next) ? next : `INVALID:${label}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value) && value.length <= 254;
}

function normalizePhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1).replace(/\D/g, "")}`;
  return digits.replace(/\D/g, "");
}

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function monthlyBillEstimate(gasRange: string, hydroRange: string) {
  const gas = billRangeMidpoint(gasRange);
  const hydro = billRangeMidpoint(hydroRange);
  const total = gas + hydro;
  return total > 0 ? total : null;
}

function billRangeMidpoint(value: string) {
  if (value === "<$150") return 125;
  if (value === "$150-$250") return 200;
  if (value === "$250-$400") return 325;
  if (value === "$400+") return 450;
  return 0;
}

function isMissingColumn(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.message?.includes("schema cache") || false;
}
