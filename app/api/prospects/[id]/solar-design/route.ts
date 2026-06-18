import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getProspect, supabaseAdmin, updateProspect } from "@/lib/supabase";
import {
  normalizeSolarDesign,
  parseSolarDesignFromSvg,
  renderSolarDesignSvg,
  summarizeSolarDesign,
  type SolarDesign,
} from "@/lib/solarDesign";
import type { ProspectStage } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const { id } = await params;
  const prospect = await getProspect(id);
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!prospect.panel_svg_url) {
    return NextResponse.json({ design: null });
  }

  try {
    const res = await fetch(prospect.panel_svg_url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ design: null, warning: `Saved design image unavailable: ${res.status}` });
    }

    const design = parseSolarDesignFromSvg(await res.text());
    return NextResponse.json({ design, designUrl: prospect.panel_svg_url });
  } catch (error) {
    return NextResponse.json({
      design: null,
      warning: error instanceof Error ? error.message : "Saved design unavailable.",
    });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const { id } = await params;
  const prospect = await getProspect(id);
  if (!prospect) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const normalized = normalizeSolarDesign(body.design);
  if (!normalized) {
    return NextResponse.json({ error: "A solar design with at least one panel is required." }, { status: 400 });
  }

  const design: SolarDesign = {
    ...normalized,
    savedAt: new Date().toISOString(),
    source: "manual_workspace",
  };
  const summary = summarizeSolarDesign(design);
  const svg = renderSolarDesignSvg(design, `${prospect.address || prospect.company_name} solar design`);
  const svgPath = `panels/${prospect.id}/custom-design.svg`;

  const { error: uploadError } = await supabaseAdmin()
    .storage.from("openclaw")
    .upload(svgPath, Buffer.from(svg), { contentType: "image/svg+xml", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data: pub } = supabaseAdmin().storage.from("openclaw").getPublicUrl(svgPath);
  const nextStage = shouldPromoteToSolarDone(prospect.stage) ? "solar_done" : prospect.stage;
  const updated = await updateProspect(prospect.id, {
    panel_count: summary.panelCount,
    system_kw: Math.round(summary.systemKw * 10) / 10,
    yearly_kwh: Math.round(summary.yearlyKwh),
    yearly_savings: Math.round(summary.yearlySavings),
    savings_25yr: Math.round(summary.savings25yr),
    system_cost: Math.round(summary.systemCost),
    incentive_amount: Math.round(summary.incentiveAmount),
    panel_svg_url: pub.publicUrl,
    stage: nextStage,
  });

  if (!updated) {
    return NextResponse.json({ error: "Design saved, but prospect update failed." }, { status: 400 });
  }

  return NextResponse.json({
    design,
    designUrl: pub.publicUrl,
    summary,
    prospect: updated,
  });
}

function shouldPromoteToSolarDone(stage: ProspectStage) {
  return ["sourced", "geocoded", "qualified", "satellite_done"].includes(stage);
}
