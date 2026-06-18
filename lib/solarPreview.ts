import sharp from "sharp";
import type { SolarInsights, SolarPanel } from "./types";
import { googleApiError, googleMapsServerKey, googleSolarApiKey } from "./googleApi";
import { latLngToPixel, panelRotationDegrees } from "./pipeline/solar";

export const PREVIEW_WIDTH = 1280;
export const PREVIEW_HEIGHT = 800;
export const DEFAULT_ANALYSIS_ZOOM = 19;
export const PANEL_BASE_ZOOM = 18;
export const PANEL_BASE_WIDTH = 4.2;
export const PANEL_BASE_HEIGHT = 7.6;

export type SolarDataLayers = {
  dsmUrl: string | null;
  annualFluxUrl: string | null;
  monthlyFluxUrl: string | null;
  hourlyShadeUrls: string[];
  rgbUrl: string | null;
  maskUrl: string | null;
  imageryQuality: "HIGH" | "MEDIUM" | "BASE" | null;
  imageryDate: { year: number; month: number; day: number } | null;
  imageryProcessedDate: { year: number; month: number; day: number } | null;
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
  const key = googleSolarApiKey();
  if (!key) {
    return {
      dsmUrl: null,
      annualFluxUrl: null,
      monthlyFluxUrl: null,
      hourlyShadeUrls: [],
      rgbUrl: null,
      maskUrl: null,
      imageryQuality: null,
      imageryDate: null,
      imageryProcessedDate: null,
      warning: "GOOGLE_SOLAR_API_KEY, GOOGLE_MAPS_SERVER_API_KEY, or GOOGLE_MAPS_API_KEY is not configured.",
    };
  }

  const params = new URLSearchParams({
    "location.latitude": String(lat),
    "location.longitude": String(lng),
    radiusMeters: "100",
    view: "FULL_LAYERS",
    requiredQuality: "BASE",
    pixelSizeMeters: "0.5",
    key,
  });

  try {
    const res = await fetch(`https://solar.googleapis.com/v1/dataLayers:get?${params.toString()}`);
    if (!res.ok) {
      const warning = await googleApiError(res, "Solar data layers");
      return {
        dsmUrl: null,
        annualFluxUrl: null,
        monthlyFluxUrl: null,
        hourlyShadeUrls: [],
        rgbUrl: null,
        maskUrl: null,
        imageryQuality: null,
        imageryDate: null,
        imageryProcessedDate: null,
        warning,
      };
    }
    const json = await res.json();
    return {
      dsmUrl: typeof json.dsmUrl === "string" ? json.dsmUrl : null,
      annualFluxUrl: typeof json.annualFluxUrl === "string" ? json.annualFluxUrl : null,
      monthlyFluxUrl: typeof json.monthlyFluxUrl === "string" ? json.monthlyFluxUrl : null,
      hourlyShadeUrls: Array.isArray(json.hourlyShadeUrls)
        ? json.hourlyShadeUrls.filter((url: unknown): url is string => typeof url === "string")
        : [],
      rgbUrl: typeof json.rgbUrl === "string" ? json.rgbUrl : null,
      maskUrl: typeof json.maskUrl === "string" ? json.maskUrl : null,
      imageryQuality: json.imageryQuality === "HIGH" || json.imageryQuality === "MEDIUM" || json.imageryQuality === "BASE" ? json.imageryQuality : null,
      imageryDate: normalizeSolarDate(json.imageryDate),
      imageryProcessedDate: normalizeSolarDate(json.imageryProcessedDate),
      warning:
        typeof json.annualFluxUrl === "string" && typeof json.maskUrl === "string"
          ? null
          : "Solar data layers are partial for this roof. Using the best available analysis.",
    };
  } catch (error) {
    return {
      dsmUrl: null,
      annualFluxUrl: null,
      monthlyFluxUrl: null,
      hourlyShadeUrls: [],
      rgbUrl: null,
      maskUrl: null,
      imageryQuality: null,
      imageryDate: null,
      imageryProcessedDate: null,
      warning: error instanceof Error ? error.message : "Solar data layers unavailable.",
    };
  }
}

function normalizeSolarDate(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const date = value as { year?: unknown; month?: unknown; day?: unknown };
  const year = Number(date.year);
  const month = Number(date.month);
  const day = Number(date.day);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
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
  const analysis = await buildPanelDesignOverlay({
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
  const key = googleMapsServerKey();
  if (!key) {
    throw new Error("GOOGLE_MAPS_SERVER_API_KEY or GOOGLE_MAPS_API_KEY is not configured.");
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
    throw new Error(await googleApiError(res, "Static Maps"));
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

async function buildPanelDesignOverlay({
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
    return { imageBuffer: fallbackBase, warning: "Solar API did not return panel placement data for a panel-design overlay." };
  }

  const segmentAzimuths: Record<number, number> = {};
  insights.roofSegments.forEach((segment, index) => {
    segmentAzimuths[index] = segment.azimuthDegrees;
  });

  const groups = groupPanelsBySegment(panels, lat, lng, zoom, segmentAzimuths);
  const selected = selectStrongestRoofPlanes(groups);
  const planeMarkup = buildRoofPlaneContextMarkup(selected);
  const panelMarkup = buildPanelMarkup(panels, lat, lng, zoom, insights);

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
      <defs>
        <filter id="panelGlow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="1.25"/>
        </filter>
      </defs>
      <g>${planeMarkup}</g>
      <g filter="url(#panelGlow)" opacity=".48">${panelMarkup.glow}</g>
      <g>${panelMarkup.panels}</g>
    </svg>`
  );

  const overlay = await sharp(svg).png().toBuffer();

  const imageBuffer = await sharp(fallbackBase)
    .composite([{ input: overlay, blend: "over" }])
    .png()
    .toBuffer();

  return { imageBuffer, warning: null };
}

function buildRoofPlaneContextMarkup(selected: RoofPlaneGroup[]) {
  if (!selected.length) return "";

  const maxTotal = Math.max(...selected.map((group) => group.totalEnergy), 1);

  return selected
    .map((group) => {
      const polygon = buildPlanePolygon(group);
      const score = group.totalEnergy / maxTotal;
      const fillOpacity = (0.035 + score * 0.035).toFixed(3);
      const strokeOpacity = (0.24 + score * 0.2).toFixed(3);
      const points = polygon.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");

      return `
        <polygon points="${points}" fill="rgba(192,138,75,${fillOpacity})" stroke="rgba(216,168,102,${strokeOpacity})" stroke-width="1.1" />
        <polyline points="${points} ${polygon[0].x.toFixed(1)},${polygon[0].y.toFixed(1)}" fill="none" stroke="rgba(236,233,227,.12)" stroke-width=".45" />
      `;
    })
    .join("");
}

function buildPanelMarkup(
  panels: SolarPanel[],
  centerLat: number,
  centerLng: number,
  zoom: number,
  insights: SolarInsights
) {
  const scale = Math.pow(2, zoom - PANEL_BASE_ZOOM);
  const width = PANEL_BASE_WIDTH * scale;
  const height = PANEL_BASE_HEIGHT * scale;
  const maxEnergy = Math.max(...panels.map((panel) => panel.yearlyEnergyDcKwh), 1);

  const rects = panels.map((panel) => {
    const point = latLngToPixel(panel.center.latitude, panel.center.longitude, centerLat, centerLng, zoom, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    const azimuth = panelRotationDegrees(panel, insights);
    const energyScore = clamp(panel.yearlyEnergyDcKwh / maxEnergy, 0.28, 1);
    const fillOpacity = (0.54 + energyScore * 0.32).toFixed(3);

    return {
      x: point.x,
      y: point.y,
      azimuth,
      fillOpacity,
    };
  });

  return {
    glow: rects
      .map(
        (rect) =>
          `<rect x="${(rect.x - width / 2).toFixed(1)}" y="${(rect.y - height / 2).toFixed(1)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${(0.55 * scale).toFixed(2)}" fill="#5aa5c8" transform="rotate(${rect.azimuth.toFixed(1)}, ${rect.x.toFixed(1)}, ${rect.y.toFixed(1)})" />`
      )
      .join(""),
    panels: rects
      .map(
        (rect) =>
          `<rect x="${(rect.x - width / 2).toFixed(1)}" y="${(rect.y - height / 2).toFixed(1)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${(0.45 * scale).toFixed(2)}" fill="rgba(72,143,177,${rect.fillOpacity})" stroke="rgba(214,240,247,.82)" stroke-width="${(0.36 * scale).toFixed(2)}" transform="rotate(${rect.azimuth.toFixed(1)}, ${rect.x.toFixed(1)}, ${rect.y.toFixed(1)})" />`
      )
      .join(""),
  };
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
