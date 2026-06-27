import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getProspect, updateProspect, supabaseAdmin } from "@/lib/supabase";
import type { Prospect } from "@/lib/types";

const PATCHABLE_PROSPECT_FIELDS = new Set<keyof Prospect>([
  "company_name",
  "contact_name",
  "address",
  "city",
  "industry",
  "sqft",
  "year_built",
  "owner_name",
  "owner_title",
  "owner_email",
  "owner_mobile",
  "stage",
  "include_solar",
  "include_ev",
  "include_heat_pump",
  "monthly_energy_bill",
  "interested_solar",
  "interested_heat_pump",
  "interested_ev",
  "heat_pump_annual_savings",
  "insurance_quote_consent",
  "insurance_consent_at",
  "ev_charger_count",
  "ev_charger_annual_value",
  "ev_charger_notes",
  "panel_count",
  "system_kw",
  "yearly_kwh",
  "yearly_savings",
  "savings_25yr",
  "system_cost",
  "incentive_amount",
  "video_url",
  "video_thumbnail_url",
  "ev_video_url",
  "ev_video_thumbnail_url",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const { id } = await params;
  const prospect = await getProspect(id);
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(prospect);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const updates = sanitizeProspectPatch(body);
  if (!updates) {
    return NextResponse.json({ error: "No valid prospect fields supplied." }, { status: 400 });
  }

  const updated = await updateProspect(id, updates);
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 400 });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const { id } = await params;
  const { error } = await supabaseAdmin().from("prospects").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}

function sanitizeProspectPatch(body: unknown): Partial<Prospect> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const updates: Partial<Prospect> = {};
  for (const [key, value] of Object.entries(body)) {
    if (PATCHABLE_PROSPECT_FIELDS.has(key as keyof Prospect)) {
      (updates as Record<string, unknown>)[key] = value;
    }
  }

  return Object.keys(updates).length ? updates : null;
}
