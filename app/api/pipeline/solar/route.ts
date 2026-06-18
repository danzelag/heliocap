import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getProspect, updateProspect } from "@/lib/supabase";
import {
  fetchSolarInsights,
  calculateEconomics,
  generatePanelSvg,
} from "@/lib/pipeline/solar";
import { fetchCurrentIncentiveRate } from "@/lib/pipeline/outreach";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const { id } = await req.json();
  const prospect = await getProspect(id);
  if (!prospect?.lat || !prospect?.lng) {
    return NextResponse.json({ error: "Prospect not geocoded" }, { status: 400 });
  }

  const solar = await fetchSolarInsights(prospect.lat, prospect.lng);
  if (!solar.ok || !solar.data) {
    return NextResponse.json({ error: solar.error }, { status: 422 });
  }

  const incentiveRate = await fetchCurrentIncentiveRate();
  const econ = calculateEconomics(solar.data, prospect.year_built ?? 2000, incentiveRate);

  const zoom = (prospect.sqft ?? 50_000) >= 200_000 ? 17 : 18;
  const svg = generatePanelSvg(
    econ.deployedPanels,
    solar.data,
    prospect.lat,
    prospect.lng,
    zoom
  );

  const svgPath = `panels/${prospect.id}/overlay.svg`;
  await supabaseAdmin()
    .storage.from("openclaw")
    .upload(svgPath, Buffer.from(svg), { contentType: "image/svg+xml", upsert: true });
  const { data: pub } = supabaseAdmin().storage.from("openclaw").getPublicUrl(svgPath);

  const updated = await updateProspect(prospect.id, {
    panel_count: econ.panelCount,
    system_kw: Math.round(econ.systemKw * 10) / 10,
    yearly_kwh: Math.round(econ.yearlyKwh),
    yearly_savings: Math.round(econ.yearlySavings),
    savings_25yr: Math.round(econ.savings25yr),
    system_cost: Math.round(econ.systemCost),
    incentive_amount: Math.round(econ.incentiveAmount),
    panel_svg_url: pub.publicUrl,
    stage: "solar_done",
  });

  return NextResponse.json(updated);
}
