import sharp from "sharp";
import type { SolarInsights, SolarPanel } from "./types";
import { latLngToPixel } from "./pipeline/solar";

export const PREVIEW_WIDTH = 1280;
export const PREVIEW_HEIGHT = 800;

export type SolarDataLayers = {
  annualFluxUrl: string | null;
  rgbUrl: string | null;
  maskUrl: string | null;
  warning: string | null;
};

export type SolarAnalysisResult = {
  imageBuffer: Buffer;
  source: "proposal_cluster_overlay" | "panel_cluster_fallback";
  warning: string | null;
};

type StaticMapOptions = {
  lat: number;
  lng: number;
  zoom: number;
  size?: string;
  maptype?: string;
};

type DataLayersOptions = {
  lat: number;
  lng: number;
};

type SolarAnalysisOptions = {
  dataLayers: SolarDataLayers;
  insights: SolarInsights;
  panels: SolarPanel[];
  lat: number;
  lng: number;
  zoom: number;
};

export function buildPreviewMapImageUrl(lat: number, lng: number, zoom: number) {
  return `/api/maps/static?lat=${lat}&lng=${lng}&zoom=${zoom}&size=640x400&maptype=satellite`;
}

export async function fetchSolarDataLayers({ lat, lng }: DataLayersOptions): Promise<SolarDataLayers> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return { annualFluxUrl: null, rgbUrl: null, maskUrl: null, warning: "GOOGLE_MAPS_API_KEY is not configured." };
  }

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
      return {
        annualFluxUrl: null,
        rgbUrl: null,
        maskUrl: null,
        warning: `Solar data layers unavailable: ${res.status}`,
      };
    }
    const json = await res.json();
    return {
      annualFluxUrl: typeof json.annualFluxUrl === "string" ? json.annualFluxUrl : null,
      rgbUrl: typeof json.rgbUrl === "string" ? json.rgbUrl : null,
      maskUrl: typeof json.maskUrl === "string" ? json.maskUrl : null,
      warning:
        typeof json.annualFluxUrl === "string" && typeof json.maskUrl === "string"
          ? null
          : "Solar data layers are partial for this roof. Using the best available analysis.",
    };
  } catch (error) {
    return {
      annualFluxUrl: null,
      rgbUrl: null,
      maskUrl: null,
      warning: error instanceof Error ? error.message : "Solar data layers unavailable.",
    };
  }
}

export async function buildSolarAnalysisImage({
  dataLayers,
  insights,
  panels,
  lat,
  lng,
  zoom,
}: SolarAnalysisOptions): Promise<SolarAnalysisResult> {
  const fallbackBase = await buildDarkBaseFromStaticMap({ lat, lng, zoom });
  const analysis = await buildRoofPlaneOverlay({
    fallbackBase,
    insights,
    panels,
    lat,
    lng,
    zoom,
  });

  return {
    imageBuffer: analysis.imageBuffer,
    source: dataLayers.annualFluxUrl || dataLayers.maskUrl ? "proposal_cluster_overlay" : "panel_cluster_fallback",
    warning:
      dataLayers.annualFluxUrl || dataLayers.maskUrl
        ? analysis.warning ?? "Solar imagery layers were retrieved. The proposal view uses strongest roof planes inferred from Solar API panel and segment data."
        : dataLayers.warning ?? "Solar data layers were unavailable. Using panel-cluster analysis fallback.",
  };
}

async function buildDarkBaseFromStaticMap({ lat, lng, zoom, size = "640x400", maptype = "satellite" }: StaticMapOptions) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured.");
  }

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(Math.max(1, Math.min(21, zoom))),
    size,
    maptype,
    scale: "2",
    key,
  });

  const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Static Maps failed: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return toneBaseImage(buffer);
}

async function toneBaseImage(buffer: Buffer) {
  return sharp(buffer)
    .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, { fit: "cover", position: "centre" })
    .modulate({ brightness: 0.48, saturation: 0.68 })
    .linear(0.9, -8)
    .gamma(1.12)
    .png()
    .toBuffer();
}

async function buildRoofPlaneOverlay({
  fallbackBase,
  insights,
  panels,
  lat,
  lng,
  zoom,
}: {
  fallbackBase: Buffer;
  insights: SolarInsights;
  panels: SolarPanel[];
  lat: number;
  lng: number;
  zoom: number;
}) {
  if (!panels.length) {
    return { imageBuffer: fallbackBase, warning: "Solar API did not return panel placement data for a roof-plane overlay." };
  }

  const segmentAzimuths: Record<number, number> = {};
  insights.roofSegments.forEach((segment, index) => {
    segmentAzimuths[index] = segment.azimuthDegrees;
  });

  const groups = groupPanelsBySegment(panels, lat, lng, zoom, segmentAzimuths);
  const selected = selectStrongestRoofPlanes(groups);

  if (!selected.length) {
    return { imageBuffer: fallbackBase, warning: "Solar API panel clusters were too sparse to infer a clean roof-plane overlay." };
  }

  const maxTotal = Math.max(...selected.map((group) => group.totalEnergy), 1);
  const planeMarkup = selected
    .map((group) => {
      const polygon = buildPlanePolygon(group);
      const score = group.totalEnergy / maxTotal;
      const fillOpacity = (0.2 + score * 0.14).toFixed(3);
      const strokeOpacity = (0.5 + score * 0.28).toFixed(3);
      const points = polygon.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

      return `
        <polygon points="${points}" fill="rgba(192,138,75,${fillOpacity})" stroke="rgba(216,168,102,${strokeOpacity})" stroke-width="1.4" />
        <polyline points="${points} ${polygon[0].x.toFixed(1)},${polygon[0].y.toFixed(1)}" fill="none" stroke="rgba(236,233,227,.18)" stroke-width=".6" />
      `;
    })
    .join("");

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
      <defs>
        <filter id="planeSoft" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur stdDeviation="1.8"/>
        </filter>
      </defs>
      <g filter="url(#planeSoft)" opacity=".72">${planeMarkup}</g>
      <g>${planeMarkup}</g>
    </svg>`
  );

  const overlay = await sharp(svg).png().toBuffer();

  const imageBuffer = await sharp(fallbackBase)
    .composite([{ input: overlay, blend: "over" }])
    .png()
    .toBuffer();

  return { imageBuffer, warning: null };
}

type PanelPoint = {
  x: number;
  y: number;
  energy: number;
};

type RoofPlaneGroup = {
  segmentIndex: number;
  azimuth: number;
  totalEnergy: number;
  points: PanelPoint[];
  center: { x: number; y: number };
};

function groupPanelsBySegment(
  panels: SolarPanel[],
  centerLat: number,
  centerLng: number,
  zoom: number,
  segmentAzimuths: Record<number, number>
) {
  const groups = new Map<number, PanelPoint[]>();

  panels.forEach((panel) => {
    const projected = latLngToPixel(panel.center.latitude, panel.center.longitude, centerLat, centerLng, zoom, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    const points = groups.get(panel.segmentIndex) ?? [];
    points.push({
      x: projected.x,
      y: projected.y,
      energy: panel.yearlyEnergyDcKwh,
    });
    groups.set(panel.segmentIndex, points);
  });

  return Array.from(groups.entries()).map(([segmentIndex, points]) => {
    const totalEnergy = points.reduce((sum, point) => sum + point.energy, 0);
    return {
      segmentIndex,
      azimuth: segmentAzimuths[segmentIndex] ?? 180,
      totalEnergy,
      points,
      center: {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      },
    };
  });
}

function selectStrongestRoofPlanes(groups: RoofPlaneGroup[]) {
  const ranked = groups
    .filter((group) => group.points.length >= 3 && group.totalEnergy > 0)
    .sort((a, b) => b.totalEnergy - a.totalEnergy);

  if (!ranked.length) return [];

  const totalEnergy = ranked.reduce((sum, group) => sum + group.totalEnergy, 0);
  const selected: RoofPlaneGroup[] = [];
  let runningEnergy = 0;

  for (const group of ranked) {
    if (selected.length >= 3) break;
    if (selected.length > 0 && group.totalEnergy / totalEnergy < 0.08) continue;
    selected.push(group);
    runningEnergy += group.totalEnergy;
    if (selected.length >= 2 && runningEnergy / totalEnergy >= 0.72) break;
  }

  return selected.length ? selected : [ranked[0]];
}

function buildPlanePolygon(group: RoofPlaneGroup) {
  const angle = ((group.azimuth - 90) * Math.PI) / 180;
  const ux = { x: Math.cos(angle), y: Math.sin(angle) };
  const uy = { x: -Math.sin(angle), y: Math.cos(angle) };
  const local = group.points.map((point) => {
    const dx = point.x - group.center.x;
    const dy = point.y - group.center.y;
    return {
      x: dx * ux.x + dy * ux.y,
      y: dx * uy.x + dy * uy.y,
    };
  });

  const minX = Math.min(...local.map((point) => point.x));
  const maxX = Math.max(...local.map((point) => point.x));
  const minY = Math.min(...local.map((point) => point.y));
  const maxY = Math.max(...local.map((point) => point.y));
  const widthPad = clamp((maxX - minX) * 0.08, 10, 22);
  const heightPad = clamp((maxY - minY) * 0.1, 12, 24);
  const corners = [
    { x: minX - widthPad, y: minY - heightPad },
    { x: maxX + widthPad, y: minY - heightPad },
    { x: maxX + widthPad, y: maxY + heightPad },
    { x: minX - widthPad, y: maxY + heightPad },
  ];

  return corners.map((corner) => ({
    x: group.center.x + corner.x * ux.x + corner.y * uy.x,
    y: group.center.y + corner.x * ux.y + corner.y * uy.y,
  }));
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
