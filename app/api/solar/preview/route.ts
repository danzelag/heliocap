import { NextRequest, NextResponse } from "next/server";
import { fetchSolarInsights, calculateEconomics } from "@/lib/pipeline/solar";
import { buildPreviewMapImageUrl, fetchSolarDataLayers } from "@/lib/solarPreview";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const yearBuilt = Number(req.nextUrl.searchParams.get("year_built") ?? "2000");
  const zoom = Number(req.nextUrl.searchParams.get("zoom") ?? "18");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const targetImageUrl = buildPreviewMapImageUrl(lat, lng, zoom);
  const insights = await fetchSolarInsights(lat, lng);

  if (!insights.ok || !insights.data) {
    return NextResponse.json({
      target: targetPayload(targetImageUrl),
      solar: {
        ok: false,
        error: insights.error ?? "Solar API did not return data for this location.",
      },
    });
  }

  const economics = calculateEconomics(insights.data, Number.isFinite(yearBuilt) ? yearBuilt : 2000);
  const dataLayers = await fetchSolarDataLayers({ lat, lng });

  return NextResponse.json({
    target: targetPayload(targetImageUrl),
    solar: {
      ok: true,
      panelCount: economics.panelCount,
      systemKw: Math.round(economics.systemKw * 10) / 10,
      yearlyKwh: Math.round(economics.yearlyKwh),
      yearlySavings: Math.round(economics.yearlySavings),
      annualFluxUrl: dataLayers.annualFluxUrl,
      rgbUrl: dataLayers.rgbUrl,
      maskUrl: dataLayers.maskUrl,
      dataLayerWarning: dataLayers.warning,
      analysisImageUrl: `/api/solar/analysis-image?lat=${lat}&lng=${lng}&zoom=${zoom}&year_built=${Number.isFinite(yearBuilt) ? yearBuilt : 2000}`,
      analysisSource: dataLayers.annualFluxUrl || dataLayers.maskUrl ? "proposal_cluster_overlay" : "panel_cluster_fallback",
    },
  });
}

function targetPayload(imageUrl: string) {
  return {
    imageUrl,
    source: "google_maps_satellite_fallback",
    warning: null,
  };
}
