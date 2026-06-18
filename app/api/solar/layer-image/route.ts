import { NextRequest, NextResponse } from "next/server";
import * as geotiff from "geotiff";
import sharp from "sharp";
import { requireAdminApi } from "@/lib/adminAuth";
import { googleApiError, googleSolarApiKey } from "@/lib/googleApi";
import { PREVIEW_HEIGHT, PREVIEW_WIDTH, fetchSolarDataLayers } from "@/lib/solarPreview";

type LayerKind = "rgb" | "mask" | "annual_flux" | "monthly_flux" | "hourly_shade" | "dsm";

export async function GET(req: NextRequest) {
  const auth = requireAdminApi(req);
  if (auth) return auth;

  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const layer = normalizeLayer(req.nextUrl.searchParams.get("layer"));
  const month = clampInt(Number(req.nextUrl.searchParams.get("month") ?? "6"), 1, 12);
  const day = clampInt(Number(req.nextUrl.searchParams.get("day") ?? "21"), 1, 31);
  const hour = clampInt(Number(req.nextUrl.searchParams.get("hour") ?? "13"), 0, 23);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const dataLayers = await fetchSolarDataLayers({ lat, lng });
  const sourceUrl = urlForLayer(dataLayers, layer, month);
  if (!sourceUrl) {
    return NextResponse.json({ error: `${layer} layer is unavailable for this location.` }, { status: 404 });
  }

  const key = googleSolarApiKey();
  if (!key) {
    return NextResponse.json({ error: "GOOGLE_SOLAR_API_KEY, GOOGLE_MAPS_SERVER_API_KEY, or GOOGLE_MAPS_API_KEY is not configured." }, { status: 500 });
  }

  const buffer = await renderGeoTiffLayer(sourceUrl, key, layer, { month, day, hour });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=900",
    },
  });
}

async function renderGeoTiffLayer(
  sourceUrl: string,
  key: string,
  layer: LayerKind,
  time: { month: number; day: number; hour: number }
) {
  const res = await fetch(appendKey(sourceUrl, key));
  if (!res.ok) {
    throw new Error(await googleApiError(res, "GeoTIFF fetch"));
  }

  const tiff = await geotiff.fromArrayBuffer(await res.arrayBuffer());
  const image = await tiff.getImage();
  const nativeWidth = image.getWidth();
  const nativeHeight = image.getHeight();
  const width = Math.min(nativeWidth, 900);
  const height = Math.max(1, Math.round((nativeHeight / nativeWidth) * width));

  if (layer === "rgb") {
    const raster = await image.readRasters({ interleave: true, width, height, samples: [0, 1, 2] });
    const rgba = rgbaFromRgb(raster as ArrayLike<number>, width, height);
    return pngFromRgba(rgba, width, height);
  }

  const sampleIndex = layer === "monthly_flux" ? time.month - 1 : layer === "hourly_shade" ? time.hour : 0;
  const raster = await image.readRasters({ width, height, samples: [sampleIndex] });
  const values = raster[0] as ArrayLike<number>;
  const rgba =
    layer === "hourly_shade"
      ? rgbaFromShade(values, width, height, time.day)
      : rgbaFromScalar(values, width, height, layer);

  return pngFromRgba(rgba, width, height);
}

function rgbaFromRgb(values: ArrayLike<number>, width: number, height: number) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    out[i * 4] = clampByte(values[i * 3] ?? 0);
    out[i * 4 + 1] = clampByte(values[i * 3 + 1] ?? 0);
    out[i * 4 + 2] = clampByte(values[i * 3 + 2] ?? 0);
    out[i * 4 + 3] = 255;
  }
  return out;
}

function rgbaFromShade(values: ArrayLike<number>, width: number, height: number, day: number) {
  const out = Buffer.alloc(width * height * 4);
  const bit = 1 << (day - 1);

  for (let i = 0; i < width * height; i += 1) {
    const value = Number(values[i]);
    const valid = Number.isFinite(value) && value !== -9999;
    const sunny = valid && (value & bit) !== 0;
    out[i * 4] = sunny ? 216 : 29;
    out[i * 4 + 1] = sunny ? 168 : 70;
    out[i * 4 + 2] = sunny ? 102 : 95;
    out[i * 4 + 3] = valid ? 220 : 0;
  }

  return out;
}

function rgbaFromScalar(values: ArrayLike<number>, width: number, height: number, layer: LayerKind) {
  const validValues: number[] = [];
  for (let i = 0; i < width * height; i += 1) {
    const value = Number(values[i]);
    if (Number.isFinite(value) && value !== -9999 && value > 0) validValues.push(value);
  }

  const min = percentile(validValues, layer === "mask" ? 0 : 0.03);
  const max = percentile(validValues, 0.98);
  const out = Buffer.alloc(width * height * 4);

  for (let i = 0; i < width * height; i += 1) {
    const value = Number(values[i]);
    const valid = Number.isFinite(value) && value !== -9999 && value > 0;
    const t = valid && max > min ? clamp((value - min) / (max - min), 0, 1) : valid ? 1 : 0;
    const color = colorForLayer(layer, t);

    out[i * 4] = color[0];
    out[i * 4 + 1] = color[1];
    out[i * 4 + 2] = color[2];
    out[i * 4 + 3] = valid ? color[3] : 0;
  }

  return out;
}

function colorForLayer(layer: LayerKind, t: number): [number, number, number, number] {
  if (layer === "mask") return [216, 168, 102, Math.round(65 + t * 120)];
  if (layer === "dsm") return [Math.round(55 + t * 170), Math.round(83 + t * 150), Math.round(98 + t * 120), 230];

  const stops: Array<[number, number, number]> = [
    [20, 46, 63],
    [69, 133, 143],
    [179, 158, 87],
    [245, 193, 94],
  ];
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const start = stops[index];
  const end = stops[index + 1];
  return [
    Math.round(start[0] + (end[0] - start[0]) * local),
    Math.round(start[1] + (end[1] - start[1]) * local),
    Math.round(start[2] + (end[2] - start[2]) * local),
    235,
  ];
}

async function pngFromRgba(rgba: Buffer, width: number, height: number) {
  return sharp(rgba, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

function urlForLayer(dataLayers: Awaited<ReturnType<typeof fetchSolarDataLayers>>, layer: LayerKind, month: number) {
  if (layer === "rgb") return dataLayers.rgbUrl;
  if (layer === "mask") return dataLayers.maskUrl;
  if (layer === "annual_flux") return dataLayers.annualFluxUrl;
  if (layer === "monthly_flux") return dataLayers.monthlyFluxUrl;
  if (layer === "hourly_shade") return dataLayers.hourlyShadeUrls[month - 1] ?? null;
  return dataLayers.dsmUrl;
}

function appendKey(url: string, key: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}key=${encodeURIComponent(key)}`;
}

function normalizeLayer(value: string | null): LayerKind {
  if (value === "rgb" || value === "mask" || value === "annual_flux" || value === "monthly_flux" || value === "hourly_shade" || value === "dsm") {
    return value;
  }
  return "annual_flux";
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number) {
  return Math.round(clamp(Number.isFinite(value) ? value : min, min, max));
}

function clampByte(value: number) {
  return Math.round(clamp(Number.isFinite(value) ? value : 0, 0, 255));
}
