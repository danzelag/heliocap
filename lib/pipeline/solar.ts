import type { PipelineResult, SolarInsights, SolarPanel } from "../types";
import { googleApiError, requireGoogleSolarApiKey } from "../googleApi";

const KWH_RATE = 0.13; // ontario commercial TOU mid-peak blend
const WATTS_PER_PANEL = 400;
const COST_PER_WATT = 2.1; // ontario commercial installed
const RATE_ESCALATION = 0.03;

export interface SolarEconomics {
  insights: SolarInsights;
  deployedPanels: SolarPanel[];
  panelCount: number;
  systemKw: number;
  yearlyKwh: number;
  yearlySavings: number;
  savings25yr: number;
  systemCost: number;
  incentiveRate: number; // fetched dynamically
  incentiveAmount: number;
  roofAge: number;
}

export async function fetchSolarInsights(
  lat: number,
  lng: number
): Promise<PipelineResult<SolarInsights>> {
  const key = requireGoogleSolarApiKey();
  const url =
    `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    return {
      ok: false,
      error: await googleApiError(res, "Solar API"),
    };
  }

  const json = await res.json();
  const sp = json.solarPotential;

  if (!sp) {
    return { ok: false, error: "No solar potential data returned" };
  }

  return {
    ok: true,
    data: {
      panels: sp.solarPanels ?? [],
      roofSegments: sp.roofSegmentStats ?? [],
      solarPanelConfigs: sp.solarPanelConfigs ?? [],
      maxArrayPanelsCount: sp.maxArrayPanelsCount ?? 0,
      maxSunshineHoursPerYear: sp.maxSunshineHoursPerYear ?? 0,
      panelCapacityWatts: sp.panelCapacityWatts ?? WATTS_PER_PANEL,
      panelHeightMeters: sp.panelHeightMeters ?? 0,
      panelWidthMeters: sp.panelWidthMeters ?? 0,
      panelLifetimeYears: sp.panelLifetimeYears ?? 25,
      maxArrayAreaMeters2: sp.maxArrayAreaMeters2 ?? 0,
      carbonOffsetFactorKgPerMwh: sp.carbonOffsetFactorKgPerMwh ?? 0,
      wholeRoofStats: sp.wholeRoofStats ?? null,
      buildingStats: sp.buildingStats ?? null,
      imageryQuality: json.imageryQuality ?? null,
      imageryDate: json.imageryDate ?? null,
      imageryProcessedDate: json.imageryProcessedDate ?? null,
    },
  };
}

// Google orders solarPanels so that solarPanelConfigs[i] is exactly the first
// panelsCount panels of the list — the list itself is the canonical buildout.
// Re-sorting by per-panel energy and slicing cherry-picks bright spots across
// the whole roof, which renders as scattered "solar acne" instead of arrays.
// Instead: keep Google's order, deploy whole roof segments, and drop the tiny
// clusters (HVAC wells, canopy slivers, penthouse edges) that cause freckles.
const MIN_SEGMENT_PANELS = 4;
const MIN_SEGMENT_SHARE = 0.02;

export function selectDeployedPanels(insights: SolarInsights): SolarPanel[] {
  const panels = insights.panels;
  if (!panels.length) return [];

  const bySegment = new Map<number, number>();
  for (const panel of panels) {
    bySegment.set(panel.segmentIndex, (bySegment.get(panel.segmentIndex) ?? 0) + 1);
  }

  const minPanels = Math.max(MIN_SEGMENT_PANELS, Math.ceil(panels.length * MIN_SEGMENT_SHARE));
  const kept = new Set<number>();
  for (const [segmentIndex, count] of bySegment) {
    if (count >= minPanels) kept.add(segmentIndex);
  }

  // small buildings: never filter the whole roof away
  if (!kept.size) return panels;
  return panels.filter((panel) => kept.has(panel.segmentIndex));
}

// For "flat" segments (pitch near 0) the API defines azimuth arbitrarily as 0,
// so rotating by it is meaningless; draw those panels axis-aligned. LANDSCAPE
// panels sit with their long edge perpendicular to the segment azimuth.
const FLAT_PITCH_DEGREES = 7;

export function panelRotationDegrees(panel: SolarPanel, insights: SolarInsights): number {
  const segment = insights.roofSegments[panel.segmentIndex];
  const pitch = segment?.pitchDegrees ?? 0;
  const azimuth = pitch < FLAT_PITCH_DEGREES ? 0 : segment?.azimuthDegrees ?? 0;
  const landscape = panel.orientation === "LANDSCAPE" ? 90 : 0;
  return (azimuth + landscape) % 180;
}

export function metersPerPixel(lat: number, zoom: number) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export function calculateEconomics(
  insights: SolarInsights,
  yearBuilt: number,
  incentiveRate = 0.2
): SolarEconomics {
  const deployedPanels = selectDeployedPanels(insights);

  const panelCount = deployedPanels.length;
  const panelWatts = insights.panelCapacityWatts || WATTS_PER_PANEL;
  const systemKw = (panelCount * panelWatts) / 1000;
  const yearlyKwh = deployedPanels.reduce(
    (s, p) => s + p.yearlyEnergyDcKwh,
    0
  );
  const yearlySavings = yearlyKwh * KWH_RATE;
  const savings25yr = yearlySavings * 25 * Math.pow(1 + RATE_ESCALATION, 25);
  const systemCost = systemKw * 1000 * COST_PER_WATT;
  const incentiveAmount = systemCost * incentiveRate;

  const currentYear = new Date().getFullYear();
  const roofAge = currentYear - yearBuilt;

  return {
    insights,
    deployedPanels,
    panelCount,
    systemKw,
    yearlyKwh,
    yearlySavings,
    savings25yr,
    systemCost,
    incentiveRate,
    incentiveAmount,
    roofAge,
  };
}

// project each panel lat/lng to pixel coordinates on the satellite image
export function latLngToPixel(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
  w: number,
  h: number
): { x: number; y: number } {
  const scale = 256 * Math.pow(2, zoom);
  const wx = ((lng + 180) / 360) * scale;
  const wy =
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    scale;
  const cx = ((centerLng + 180) / 360) * scale;
  const cy =
    ((1 -
      Math.log(
        Math.tan((centerLat * Math.PI) / 180) +
          1 / Math.cos((centerLat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
    scale;
  return { x: w / 2 + (wx - cx), y: h / 2 + (wy - cy) };
}

export function generatePanelSvg(
  panels: SolarPanel[],
  insights: SolarInsights,
  centerLat: number,
  centerLng: number,
  zoom: number,
  w = 1280,
  h = 720
): string {
  // true panel footprint at this zoom, with a hairline gap between modules
  const mpp = metersPerPixel(centerLat, zoom);
  const pw = ((insights.panelWidthMeters || 1.045) / mpp) * 0.94;
  const ph = ((insights.panelHeightMeters || 1.879) / mpp) * 0.94;

  const rects = panels
    .map((panel) => {
      const { x, y } = latLngToPixel(
        panel.center.latitude,
        panel.center.longitude,
        centerLat,
        centerLng,
        zoom,
        w,
        h
      );
      const rotation = panelRotationDegrees(panel, insights);
      return `<rect x="${(x - pw / 2).toFixed(1)}" y="${(y - ph / 2).toFixed(1)}" width="${pw.toFixed(2)}" height="${ph.toFixed(2)}" rx="0.4" fill="#3B82F6" fill-opacity="0.75" stroke="#60A5FA" stroke-width="0.3" transform="rotate(${rotation}, ${x.toFixed(1)}, ${y.toFixed(1)})" />`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${rects}\n</svg>`;
}
