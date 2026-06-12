import { NextRequest, NextResponse } from "next/server";
import { fetchSolarInsights, calculateEconomics, latLngToPixel, panelRotationDegrees } from "@/lib/pipeline/solar";
import { DEFAULT_ANALYSIS_ZOOM, PREVIEW_HEIGHT, PREVIEW_WIDTH, buildPreviewMapImageUrl, fetchSolarDataLayers } from "@/lib/solarPreview";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const yearBuilt = Number(req.nextUrl.searchParams.get("year_built") ?? "2000");
  const zoom = Number(req.nextUrl.searchParams.get("zoom") ?? "18");
  const analysisZoom = Number(req.nextUrl.searchParams.get("analysis_zoom") ?? String(DEFAULT_ANALYSIS_ZOOM));

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
  const panelOverlay = buildPanelOverlayPayload(economics.deployedPanels, insights.data, lat, lng, zoom);
  const analysisPanelOverlay = buildPanelOverlayPayload(economics.deployedPanels, insights.data, lat, lng, analysisZoom);
  const topPanelKwh = economics.deployedPanels.reduce((max, panel) => Math.max(max, panel.yearlyEnergyDcKwh), 0);

  return NextResponse.json({
    target: targetPayload(targetImageUrl),
    solar: {
      ok: true,
      panelCount: economics.panelCount,
      systemKw: Math.round(economics.systemKw * 10) / 10,
      yearlyKwh: Math.round(economics.yearlyKwh),
      yearlySavings: Math.round(economics.yearlySavings),
      annualFluxUrl: dataLayers.annualFluxUrl,
      monthlyFluxUrl: dataLayers.monthlyFluxUrl,
      hourlyShadeUrls: dataLayers.hourlyShadeUrls,
      dsmUrl: dataLayers.dsmUrl,
      rgbUrl: dataLayers.rgbUrl,
      maskUrl: dataLayers.maskUrl,
      imageryQuality: dataLayers.imageryQuality ?? insights.data.imageryQuality,
      imageryDate: dataLayers.imageryDate ?? insights.data.imageryDate,
      imageryProcessedDate: dataLayers.imageryProcessedDate ?? insights.data.imageryProcessedDate,
      dataLayerWarning: dataLayers.warning,
      analysisImageUrl: `/api/solar/analysis-image?lat=${lat}&lng=${lng}&zoom=${Number.isFinite(analysisZoom) ? analysisZoom : DEFAULT_ANALYSIS_ZOOM}&year_built=${Number.isFinite(yearBuilt) ? yearBuilt : 2000}`,
      analysisSource: dataLayers.annualFluxUrl || dataLayers.maskUrl ? "proposal_cluster_overlay" : "panel_cluster_fallback",
      maxArrayPanelsCount: insights.data.maxArrayPanelsCount,
      maxArrayAreaMeters2: Math.round(insights.data.maxArrayAreaMeters2),
      panelCapacityWatts: Math.round(insights.data.panelCapacityWatts),
      panelWidthMeters: Math.round(insights.data.panelWidthMeters * 100) / 100,
      panelHeightMeters: Math.round(insights.data.panelHeightMeters * 100) / 100,
      panelLifetimeYears: insights.data.panelLifetimeYears,
      carbonOffsetFactorKgPerMwh: Math.round(insights.data.carbonOffsetFactorKgPerMwh),
      wholeRoofAreaMeters2: insights.data.wholeRoofStats ? Math.round(insights.data.wholeRoofStats.areaMeters2) : null,
      buildingAreaMeters2: insights.data.buildingStats ? Math.round(insights.data.buildingStats.areaMeters2) : null,
      maxSunshineHoursPerYear: Math.round(insights.data.maxSunshineHoursPerYear),
      averagePanelKwh: economics.panelCount ? Math.round(economics.yearlyKwh / economics.panelCount) : 0,
      topPanelKwh: Math.round(topPanelKwh),
      roofSegmentCount: insights.data.roofSegments.length,
      roofSegments: insights.data.roofSegments.slice(0, 8).map((segment, index) => {
        const sunshine = segment.stats.sunshineQuantiles.length
          ? segment.stats.sunshineQuantiles[segment.stats.sunshineQuantiles.length - 1]
          : 0;

        return {
          index,
          areaMeters2: Math.round(segment.stats.areaMeters2),
          pitchDegrees: Math.round(segment.pitchDegrees),
          azimuthDegrees: Math.round(segment.azimuthDegrees),
          sunshineHours: Math.round(sunshine),
          planeHeightMeters: Math.round((segment.planeHeightAtCenterMeters ?? 0) * 10) / 10,
        };
      }),
      solarPanelConfigs: insights.data.solarPanelConfigs.slice(0, 12).map((config) => ({
        panelsCount: config.panelsCount,
        yearlyEnergyDcKwh: Math.round(config.yearlyEnergyDcKwh),
        segmentCount: config.roofSegmentSummaries.length,
      })),
      panelOverlay,
      analysisPanelOverlay,
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

function buildPanelOverlayPayload(
  panels: NonNullable<ReturnType<typeof calculateEconomics>["deployedPanels"]>,
  insights: NonNullable<Awaited<ReturnType<typeof fetchSolarInsights>>["data"]>,
  lat: number,
  lng: number,
  zoom: number
) {
  return panels.map((panel, index) => {
    const point = latLngToPixel(panel.center.latitude, panel.center.longitude, lat, lng, zoom, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    return {
      id: index,
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10,
      azimuthDegrees: Math.round(panelRotationDegrees(panel, insights)),
      yearlyEnergyDcKwh: Math.round(panel.yearlyEnergyDcKwh),
      segmentIndex: panel.segmentIndex,
    };
  });
}
