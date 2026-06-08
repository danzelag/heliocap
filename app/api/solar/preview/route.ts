import { NextRequest, NextResponse } from "next/server";
import { fetchSolarInsights, calculateEconomics, latLngToPixel } from "@/lib/pipeline/solar";
import type { SolarInsights, SolarPanel } from "@/lib/types";

const WIDTH = 960;
const HEIGHT = 540;

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const yearBuilt = Number(req.nextUrl.searchParams.get("year_built") ?? "2000");
  const zoom = Number(req.nextUrl.searchParams.get("zoom") ?? "18");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const targetImageUrl = `/api/maps/static?lat=${lat}&lng=${lng}&zoom=${zoom}&size=${WIDTH}x${HEIGHT}&maptype=satellite`;
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
  const dataLayers = await fetchDataLayers(lat, lng);

  return NextResponse.json({
    target: targetPayload(targetImageUrl),
    solar: {
      ok: true,
      panelCount: economics.panelCount,
      systemKw: Math.round(economics.systemKw * 10) / 10,
      yearlyKwh: Math.round(economics.yearlyKwh),
      yearlySavings: Math.round(economics.yearlySavings),
      annualFluxUrl: dataLayers.annualFluxUrl,
      dataLayerWarning: dataLayers.warning,
      heatmapSvg: buildHeatmapSvg(economics.deployedPanels, insights.data, lat, lng, zoom),
    },
  });
}

function targetPayload(imageUrl: string) {
  return {
    imageUrl,
    source: "google_maps_satellite_fallback",
    warning: "Google Earth target did not render in this preview. Using Google Maps satellite fallback.",
  };
}

async function fetchDataLayers(lat: number, lng: number) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { annualFluxUrl: null, warning: "GOOGLE_MAPS_API_KEY is not configured." };

  const params = new URLSearchParams({
    "location.latitude": String(lat),
    "location.longitude": String(lng),
    radiusMeters: "100",
    view: "IMAGERY_AND_ANNUAL_FLUX_LAYERS",
    requiredQuality: "HIGH",
    pixelSizeMeters: "0.5",
    key,
  });

  try {
    const res = await fetch(`https://solar.googleapis.com/v1/dataLayers:get?${params.toString()}`);
    if (!res.ok) {
      return { annualFluxUrl: null, warning: `Solar data layers unavailable: ${res.status}` };
    }
    const json = await res.json();
    return {
      annualFluxUrl: typeof json.annualFluxUrl === "string" ? json.annualFluxUrl : null,
      warning: typeof json.annualFluxUrl === "string" ? null : "Solar data layers did not include annual flux.",
    };
  } catch (error) {
    return {
      annualFluxUrl: null,
      warning: error instanceof Error ? error.message : "Solar data layers unavailable.",
    };
  }
}

function buildHeatmapSvg(
  panels: SolarPanel[],
  insights: SolarInsights,
  centerLat: number,
  centerLng: number,
  zoom: number
) {
  const max = Math.max(...panels.map((panel) => panel.yearlyEnergyDcKwh), 1);
  const min = Math.min(...panels.map((panel) => panel.yearlyEnergyDcKwh), max);
  const spread = Math.max(max - min, 1);
  const segmentAzimuths: Record<number, number> = {};
  insights.roofSegments.forEach((segment, index) => {
    segmentAzimuths[index] = segment.azimuthDegrees;
  });

  const rects = panels
    .map((panel) => {
      const { x, y } = latLngToPixel(panel.center.latitude, panel.center.longitude, centerLat, centerLng, zoom, WIDTH, HEIGHT);
      const score = (panel.yearlyEnergyDcKwh - min) / spread;
      const hue = 38 - score * 24;
      const fill = `hsl(${hue.toFixed(1)} 86% ${Math.round(58 - score * 16)}%)`;
      const azimuth = segmentAzimuths[panel.segmentIndex] ?? 0;
      return `<rect x="${(x - 4).toFixed(1)}" y="${(y - 7).toFixed(1)}" width="8" height="14" rx="1" fill="${fill}" fill-opacity="${(0.52 + score * 0.42).toFixed(2)}" stroke="#f3d08c" stroke-opacity=".62" stroke-width=".7" transform="rotate(${azimuth}, ${x.toFixed(1)}, ${y.toFixed(1)})" />`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs><filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#glow)">${rects}</g></svg>`;
}
