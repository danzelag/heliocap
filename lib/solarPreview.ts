import sharp from "sharp";
import type { SolarPanel } from "./types";
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
  panels,
  lat,
  lng,
  zoom,
}: SolarAnalysisOptions): Promise<SolarAnalysisResult> {
  const fallbackBase = await buildDarkBaseFromStaticMap({ lat, lng, zoom });
  const fallback = await buildPanelClusterFallback({
    fallbackBase,
    panels,
    lat,
    lng,
    zoom,
  });

  return {
    imageBuffer: fallback,
    source: dataLayers.annualFluxUrl || dataLayers.maskUrl ? "proposal_cluster_overlay" : "panel_cluster_fallback",
    warning:
      dataLayers.annualFluxUrl || dataLayers.maskUrl
        ? "Solar imagery layers were retrieved. The proposal view uses strongest roof-panel clusters for a cleaner roof-only overlay."
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

async function buildPanelClusterFallback({
  fallbackBase,
  panels,
  lat,
  lng,
  zoom,
}: {
  fallbackBase: Buffer;
  panels: SolarPanel[];
  lat: number;
  lng: number;
  zoom: number;
}) {
  if (!panels.length) {
    return fallbackBase;
  }

  const ranked = [...panels].sort((a, b) => b.yearlyEnergyDcKwh - a.yearlyEnergyDcKwh);
  const threshold = ranked[Math.max(0, Math.floor(ranked.length * 0.2) - 1)]?.yearlyEnergyDcKwh ?? ranked[0].yearlyEnergyDcKwh;
  const maxEnergy = ranked[0].yearlyEnergyDcKwh;

  const circles = ranked
    .filter((panel) => panel.yearlyEnergyDcKwh >= threshold)
    .map((panel) => {
      const point = latLngToPixel(panel.center.latitude, panel.center.longitude, lat, lng, zoom, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      const score = clamp(panel.yearlyEnergyDcKwh / Math.max(maxEnergy, 1), 0, 1);
      const radius = 22 + score * 28;
      const opacity = (0.18 + score * 0.26).toFixed(3);
      return `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius.toFixed(1)}" fill="rgba(196,144,82,${opacity})" />`;
    })
    .join("");

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
      <defs>
        <filter id="blur"><feGaussianBlur stdDeviation="11"/></filter>
      </defs>
      <g filter="url(#blur)">${circles}</g>
    </svg>`
  );

  const overlay = await sharp(svg).png().toBuffer();

  return sharp(fallbackBase)
    .composite([{ input: overlay, blend: "over" }])
    .png()
    .toBuffer();
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
