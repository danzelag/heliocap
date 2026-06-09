import { NextRequest, NextResponse } from "next/server";
import { calculateEconomics, fetchSolarInsights } from "@/lib/pipeline/solar";
import { buildSolarAnalysisImage, fetchSolarDataLayers } from "@/lib/solarPreview";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const yearBuilt = Number(req.nextUrl.searchParams.get("year_built") ?? "2000");
  const zoom = Number(req.nextUrl.searchParams.get("zoom") ?? "18");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const insights = await fetchSolarInsights(lat, lng);
  if (!insights.ok || !insights.data) {
    return NextResponse.json({ error: insights.error ?? "Solar API did not return data for this location." }, { status: 502 });
  }

  const economics = calculateEconomics(insights.data, Number.isFinite(yearBuilt) ? yearBuilt : 2000);
  const dataLayers = await fetchSolarDataLayers({ lat, lng });
  const analysis = await buildSolarAnalysisImage({
    dataLayers,
    insights: insights.data,
    panels: economics.deployedPanels,
    lat,
    lng,
    zoom,
  });

  return new NextResponse(new Uint8Array(analysis.imageBuffer), {
    headers: {
      "Cache-Control": "private, max-age=300",
      "Content-Type": "image/png",
      "X-OpenClaw-Analysis-Source": analysis.source,
      "X-OpenClaw-Analysis-Warning": analysis.warning ?? "",
    },
  });
}

export const runtime = "nodejs";
