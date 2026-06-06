import type { PipelineResult, SolarInsights, SolarPanel } from "../types";

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
  const key = process.env.GOOGLE_SOLAR_API_KEY;
  const url =
    `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=HIGH&key=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    return {
      ok: false,
      error: `Solar API error ${res.status}: ${await res.text()}`,
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
      maxArrayPanelsCount: sp.maxArrayPanelsCount ?? 0,
      maxSunshineHoursPerYear: sp.maxSunshineHoursPerYear ?? 0,
    },
  };
}

export function calculateEconomics(
  insights: SolarInsights,
  yearBuilt: number,
  incentiveRate = 0.2
): SolarEconomics {
  const sorted = [...insights.panels].sort(
    (a, b) => b.yearlyEnergyDcKwh - a.yearlyEnergyDcKwh
  );
  const deployedPanels = sorted.slice(0, Math.floor(sorted.length * 0.7));

  const panelCount = deployedPanels.length;
  const systemKw = (panelCount * WATTS_PER_PANEL) / 1000;
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
  const segmentAzimuths: Record<number, number> = {};
  insights.roofSegments.forEach((seg, i) => {
    segmentAzimuths[i] = seg.azimuthDegrees;
  });

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
      const azimuth = segmentAzimuths[panel.segmentIndex] ?? 0;
      // panel dims in pixels: 1.045m × 1.879m at ~40cm/px at zoom 18
      const pw = 3;
      const ph = 5.4;
      return `<rect x="${(x - pw / 2).toFixed(1)}" y="${(y - ph / 2).toFixed(1)}" width="${pw}" height="${ph}" rx="0.4" fill="#3B82F6" fill-opacity="0.75" stroke="#60A5FA" stroke-width="0.3" transform="rotate(${azimuth}, ${x.toFixed(1)}, ${y.toFixed(1)})" />`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${rects}\n</svg>`;
}
