export const SOLAR_DESIGN_VERSION = 1;
export const SOLAR_DESIGN_WIDTH = 1280;
export const SOLAR_DESIGN_HEIGHT = 800;
export const SOLAR_DESIGN_METADATA_ID = "openclaw-solar-design";
export const WATTS_PER_SOLAR_PANEL = 400;
export const COMMERCIAL_KWH_RATE = 0.13;
export const COMMERCIAL_COST_PER_WATT = 2.1;
export const RATE_ESCALATION = 0.03;

export type SolarDesignPanel = {
  id: string;
  x: number;
  y: number;
  azimuthDegrees: number;
  yearlyEnergyDcKwh: number;
  segmentIndex: number;
  source?: "api" | "manual";
};

export type SolarDesign = {
  version: typeof SOLAR_DESIGN_VERSION;
  width: number;
  height: number;
  zoom: number;
  panelWidth: number;
  panelHeight: number;
  panels: SolarDesignPanel[];
  overlay: {
    x: number;
    y: number;
    scale: number;
    rotate: number;
    opacity: number;
  };
  savedAt?: string;
  source?: "google_solar_api" | "manual_workspace";
};

export type SolarDesignSummary = {
  panelCount: number;
  systemKw: number;
  yearlyKwh: number;
  yearlySavings: number;
  savings25yr: number;
  systemCost: number;
  incentiveAmount: number;
};

export function normalizeSolarDesign(value: unknown): SolarDesign | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<SolarDesign>;
  const panels = Array.isArray(candidate.panels)
    ? candidate.panels.map(normalizePanel).filter((panel): panel is SolarDesignPanel => Boolean(panel))
    : [];

  if (!panels.length || panels.length > 5000) return null;

  return {
    version: SOLAR_DESIGN_VERSION,
    width: finiteNumber(candidate.width, SOLAR_DESIGN_WIDTH, 1, 5000),
    height: finiteNumber(candidate.height, SOLAR_DESIGN_HEIGHT, 1, 5000),
    zoom: finiteNumber(candidate.zoom, 19, 1, 21),
    panelWidth: finiteNumber(candidate.panelWidth, 8.4, 1, 80),
    panelHeight: finiteNumber(candidate.panelHeight, 15.2, 1, 120),
    panels,
    overlay: {
      x: finiteNumber(candidate.overlay?.x, 0, -1000, 1000),
      y: finiteNumber(candidate.overlay?.y, 0, -1000, 1000),
      scale: finiteNumber(candidate.overlay?.scale, 1, 0.1, 5),
      rotate: finiteNumber(candidate.overlay?.rotate, 0, -180, 180),
      opacity: finiteNumber(candidate.overlay?.opacity, 0.88, 0, 1),
    },
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : undefined,
    source: candidate.source === "manual_workspace" ? "manual_workspace" : "google_solar_api",
  };
}

export function summarizeSolarDesign(design: Pick<SolarDesign, "panels">, incentiveRate = 0.2): SolarDesignSummary {
  const panelCount = design.panels.length;
  const systemKw = (panelCount * WATTS_PER_SOLAR_PANEL) / 1000;
  const yearlyKwh = design.panels.reduce((sum, panel) => sum + Math.max(0, panel.yearlyEnergyDcKwh), 0);
  const yearlySavings = yearlyKwh * COMMERCIAL_KWH_RATE;
  const savings25yr = yearlySavings * 25 * Math.pow(1 + RATE_ESCALATION, 25);
  const systemCost = systemKw * 1000 * COMMERCIAL_COST_PER_WATT;
  const incentiveAmount = systemCost * incentiveRate;

  return {
    panelCount,
    systemKw,
    yearlyKwh,
    yearlySavings,
    savings25yr,
    systemCost,
    incentiveAmount,
  };
}

export function renderSolarDesignSvg(design: SolarDesign, title: string) {
  const metadata = escapeXml(JSON.stringify(design));
  const panelMarkup = design.panels
    .map((panel) => {
      const energyScore = Math.max(0.34, Math.min(1, panel.yearlyEnergyDcKwh / 720));
      const opacity = (0.5 + energyScore * 0.34).toFixed(3);
      const x = panel.x - design.panelWidth / 2;
      const y = panel.y - design.panelHeight / 2;

      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${design.panelWidth.toFixed(2)}" height="${design.panelHeight.toFixed(2)}" rx="${(design.panelWidth * 0.08).toFixed(2)}" fill="rgba(72,143,177,${opacity})" stroke="rgba(214,240,247,.82)" stroke-width="${Math.max(0.35, design.panelWidth * 0.045).toFixed(2)}" transform="rotate(${panel.azimuthDegrees.toFixed(1)}, ${panel.x.toFixed(1)}, ${panel.y.toFixed(1)})" />`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${design.width}" height="${design.height}" viewBox="0 0 ${design.width} ${design.height}" role="img" aria-label="${escapeXml(title)}">
<metadata id="${SOLAR_DESIGN_METADATA_ID}">${metadata}</metadata>
<defs>
  <filter id="panelGlow" x="-70%" y="-70%" width="240%" height="240%">
    <feGaussianBlur stdDeviation="1.25"/>
  </filter>
</defs>
<rect width="100%" height="100%" fill="transparent"/>
<g filter="url(#panelGlow)" opacity=".42">${panelMarkup}</g>
<g>${panelMarkup}</g>
</svg>`;
}

export function parseSolarDesignFromSvg(svg: string): SolarDesign | null {
  const pattern = new RegExp(`<metadata[^>]*id=["']${SOLAR_DESIGN_METADATA_ID}["'][^>]*>([\\s\\S]*?)<\\/metadata>`, "i");
  const match = svg.match(pattern);
  if (!match?.[1]) return null;

  try {
    return normalizeSolarDesign(JSON.parse(unescapeXml(match[1])));
  } catch {
    return null;
  }
}

function normalizePanel(value: unknown): SolarDesignPanel | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<SolarDesignPanel>;
  const id = typeof candidate.id === "string" && candidate.id.length ? candidate.id.slice(0, 80) : "";
  if (!id) return null;

  return {
    id,
    x: finiteNumber(candidate.x, 0, -2000, 4000),
    y: finiteNumber(candidate.y, 0, -2000, 4000),
    azimuthDegrees: finiteNumber(candidate.azimuthDegrees, 180, -360, 360),
    yearlyEnergyDcKwh: finiteNumber(candidate.yearlyEnergyDcKwh, 550, 0, 2000),
    segmentIndex: Math.round(finiteNumber(candidate.segmentIndex, -1, -1, 2000)),
    source: candidate.source === "manual" ? "manual" : "api",
  };
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function unescapeXml(value: string) {
  return value
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}
