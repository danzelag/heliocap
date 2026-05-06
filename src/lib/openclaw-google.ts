import { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const STATIC_MAP_REQUEST_WIDTH = 640
const STATIC_MAP_REQUEST_HEIGHT = 360
const STATIC_MAP_SCALE = 2
const STATIC_MAP_WIDTH = STATIC_MAP_REQUEST_WIDTH * STATIC_MAP_SCALE
const STATIC_MAP_HEIGHT = STATIC_MAP_REQUEST_HEIGHT * STATIC_MAP_SCALE
const DEFAULT_STATIC_MAP_ZOOM = 19
const PANEL_WIDTH_METERS = 1.045
const PANEL_HEIGHT_METERS = 1.879
const PANEL_WATTS = 400
const COMMERCIAL_COST_PER_WATT = 1.8
const FEDERAL_ITC_RATE = 0.3
const DEFAULT_UTILITY_RATE = 0.18 // Ontario all-in commercial rate (electricity + Global Adjustment + delivery)
const PANEL_AREA_SQFT = PANEL_WIDTH_METERS * PANEL_HEIGHT_METERS * 10.7639
const COMMERCIAL_ROOF_UTILIZATION = 0.42
const PANEL_LAYOUT_AREA_MULTIPLIER = 1.75
const DEPLOYABLE_PANEL_RATIO = 0.46
const FALLBACK_PANEL_COUNT = 420
const MAX_REALISTIC_PANEL_COUNT = 3600
const MAX_REALISTIC_SYSTEM_KW = 1440
const REALISTIC_KWH_PER_KW = 1180
const MAX_COMMERCIAL_YEARLY_SAVINGS = 375_000

type GoogleLatLng = {
  latitude: number
  longitude: number
}

type GoogleSolarPanel = {
  center?: GoogleLatLng
  orientation?: string
  segmentIndex?: number
  yearlyEnergyDcKwh?: number
}

type GoogleRoofSegment = {
  azimuthDegrees?: number
  pitchDegrees?: number
  stats?: {
    areaMeters2?: number
  }
}

export type GoogleSolarInsights = {
  name?: string
  center?: GoogleLatLng
  solarPotential?: {
    maxArrayPanelsCount?: number
    maxArrayAreaMeters2?: number
    maxSunshineHoursPerYear?: number
    solarPanels?: GoogleSolarPanel[]
    roofSegmentStats?: GoogleRoofSegment[]
  }
}

export type SolarModel = {
  panelCount: number
  maxPanelCount: number
  systemSizeKw: number
  yearlyKwh: number
  yearlySavings: number
  savings25yr: number
  systemCost: number
  federalItc: number
  estimatedPayback: number
  utilityRate: number
  usableRoofAreaSqft: number | null
  quality: 'google_solar' | 'fallback'
  needsReview: boolean
  reviewReasons: string[]
}

type UploadAssetArgs = {
  supabase: SupabaseClient
  bucket?: 'leads' | 'prospects'
  slug: string
  fileName: string
  body: ArrayBuffer | Buffer | string
  contentType: string
}

export function getGoogleMapsApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_STATIC_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  )
}

export async function uploadLeadAsset({
  supabase,
  bucket = 'leads',
  slug,
  fileName,
  body,
  contentType,
}: UploadAssetArgs) {
  const filePath = `${slug}/${fileName}`
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, body, { contentType, upsert: true })

  if (error) throw error

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath)
  return data.publicUrl
}

export async function buildRasterRenderPreview(renderSvg: string) {
  return sharp(Buffer.from(renderSvg))
    .resize(1280, 720, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: 78,
      effort: 4,
    })
    .toBuffer()
}

export function selectStaticMapZoom(model: Pick<SolarModel, 'panelCount' | 'usableRoofAreaSqft'> | null) {
  const panelCount = model?.panelCount || 0
  const usableRoofAreaSqft = model?.usableRoofAreaSqft || 0

  if (panelCount > 1800 || usableRoofAreaSqft > 120000) return 17
  if (panelCount > 700 || usableRoofAreaSqft > 55000) return 18
  if (panelCount > 150 || usableRoofAreaSqft > 14000) return 19
  return 20
}

export function selectStaticMapCenter(insights: GoogleSolarInsights | null, fallbackLat: number, fallbackLng: number) {
  const center = insights?.center

  if (typeof center?.latitude === 'number' && typeof center?.longitude === 'number') {
    return {
      lat: center.latitude,
      lng: center.longitude,
    }
  }

  return {
    lat: fallbackLat,
    lng: fallbackLng,
  }
}

export async function fetchStaticSatelliteImage(lat: number, lng: number, zoom = DEFAULT_STATIC_MAP_ZOOM) {
  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is not configured')
  }

  const url = new URL('https://maps.googleapis.com/maps/api/staticmap')
  url.searchParams.set('center', `${lat},${lng}`)
  url.searchParams.set('zoom', String(zoom))
  url.searchParams.set('size', `${STATIC_MAP_REQUEST_WIDTH}x${STATIC_MAP_REQUEST_HEIGHT}`)
  url.searchParams.set('maptype', 'satellite')
  url.searchParams.set('scale', String(STATIC_MAP_SCALE))
  url.searchParams.set('key', apiKey)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Google Maps Static API returned ${response.status}: ${await response.text()}`)
  }

  return response.arrayBuffer()
}

export async function fetchSolarInsights(lat: number, lng: number): Promise<GoogleSolarInsights | null> {
  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is not configured')
  }

  const url = new URL('https://solar.googleapis.com/v1/buildingInsights:findClosest')
  url.searchParams.set('location.latitude', String(lat))
  url.searchParams.set('location.longitude', String(lng))
  url.searchParams.set('requiredQuality', 'HIGH')
  url.searchParams.set('key', apiKey)

  const response = await fetch(url, { cache: 'no-store' })

  if (response.status === 404) return null

  if (!response.ok) {
    throw new Error(`Google Solar API returned ${response.status}: ${await response.text()}`)
  }

  return response.json()
}

export function buildSolarModel(insights: GoogleSolarInsights | null, utilityRate = DEFAULT_UTILITY_RATE): SolarModel {
  const panels = insights?.solarPotential?.solarPanels || []
  const rawMaxPanelCount = insights?.solarPotential?.maxArrayPanelsCount || panels.length || FALLBACK_PANEL_COUNT
  const rawArrayAreaSqft = insights?.solarPotential?.maxArrayAreaMeters2
    ? insights.solarPotential.maxArrayAreaMeters2 * 10.7639
    : null
  const usableRoofAreaSqft = rawArrayAreaSqft
    ? Math.round(rawArrayAreaSqft * COMMERCIAL_ROOF_UTILIZATION)
    : null
  const roofAreaPanelLimit = usableRoofAreaSqft
    ? Math.max(24, Math.floor(usableRoofAreaSqft / (PANEL_AREA_SQFT * PANEL_LAYOUT_AREA_MULTIPLIER)))
    : FALLBACK_PANEL_COUNT
  const maxPanelCount = Math.min(rawMaxPanelCount, roofAreaPanelLimit, MAX_REALISTIC_PANEL_COUNT)
  const deployableCount = Math.max(0, Math.floor(Math.min(panels.length || maxPanelCount, maxPanelCount) * DEPLOYABLE_PANEL_RATIO))
  const sortedPanels = [...panels].sort((a, b) => (b.yearlyEnergyDcKwh || 0) - (a.yearlyEnergyDcKwh || 0))
  const deployablePanels = sortedPanels.slice(0, deployableCount)
  const panelCount = Math.min(deployablePanels.length || deployableCount || maxPanelCount, maxPanelCount)
  const systemSizeKw = panelCount * (PANEL_WATTS / 1000)
  const rawYearlyKwhFromPanels = deployablePanels.reduce((sum, panel) => sum + (panel.yearlyEnergyDcKwh || 0), 0)
  const modeledYearlyKwh = Math.round(systemSizeKw * REALISTIC_KWH_PER_KW)
  const yearlyKwh = Math.min(rawYearlyKwhFromPanels || modeledYearlyKwh, modeledYearlyKwh)
  const yearlySavings = Math.min(Math.round(yearlyKwh * utilityRate), MAX_COMMERCIAL_YEARLY_SAVINGS)
  const savings25yr = Math.round(yearlySavings * 25 * 1.03)
  const systemCost = Math.round(systemSizeKw * 1000 * COMMERCIAL_COST_PER_WATT)
  const federalItc = Math.round(systemCost * FEDERAL_ITC_RATE)
  const netCost = systemCost - federalItc
  const estimatedPayback = yearlySavings > 0 ? Number((netCost / yearlySavings).toFixed(1)) : 0
  const reviewReasons = [
    rawMaxPanelCount > MAX_REALISTIC_PANEL_COUNT ? 'google_panel_count_capped' : null,
    systemSizeKw > MAX_REALISTIC_SYSTEM_KW ? 'system_size_at_commercial_cap' : null,
    rawArrayAreaSqft && usableRoofAreaSqft ? 'roof_utilization_reduced_for_setbacks_hvac_walkways' : null,
  ].filter((reason): reason is string => Boolean(reason))

  return {
    panelCount,
    maxPanelCount: rawMaxPanelCount,
    systemSizeKw: Number(systemSizeKw.toFixed(1)),
    yearlyKwh: Math.round(yearlyKwh),
    yearlySavings,
    savings25yr,
    systemCost,
    federalItc,
    estimatedPayback,
    utilityRate,
    usableRoofAreaSqft,
    quality: insights ? 'google_solar' : 'fallback',
    needsReview: rawMaxPanelCount > MAX_REALISTIC_PANEL_COUNT || systemSizeKw > MAX_REALISTIC_SYSTEM_KW,
    reviewReasons,
  }
}

export function buildSolarOverlaySvg({
  satelliteUrl,
  insights,
  lat,
  lng,
  model,
  zoom = selectStaticMapZoom(model),
}: {
  satelliteUrl: string
  insights: GoogleSolarInsights | null
  lat: number
  lng: number
  model: SolarModel
  zoom?: number
}) {
  const panels = [...(insights?.solarPotential?.solarPanels || [])]
    .sort((a, b) => (b.yearlyEnergyDcKwh || 0) - (a.yearlyEnergyDcKwh || 0))
    .slice(0, model.panelCount)

  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom) / STATIC_MAP_SCALE
  const panelWidthPx = Math.max(4, PANEL_WIDTH_METERS / metersPerPixel)
  const panelHeightPx = Math.max(7, PANEL_HEIGHT_METERS / metersPerPixel)

  const panelRects = panels
    .map((panel) => {
      if (!panel.center) return ''
      const point = latLngToPixel(
        panel.center.latitude,
        panel.center.longitude,
        lat,
        lng,
        zoom,
        STATIC_MAP_WIDTH,
        STATIC_MAP_HEIGHT,
        STATIC_MAP_SCALE
      )
      const segment = panel.segmentIndex != null
        ? insights?.solarPotential?.roofSegmentStats?.[panel.segmentIndex]
        : undefined
      const azimuth = segment?.azimuthDegrees || 180
      const rotation = panel.orientation === 'LANDSCAPE' ? azimuth + 90 : azimuth

      return `<rect x="${(-panelWidthPx / 2).toFixed(2)}" y="${(-panelHeightPx / 2).toFixed(2)}" width="${panelWidthPx.toFixed(2)}" height="${panelHeightPx.toFixed(2)}" rx="1.2" fill="#0f172a" stroke="#67e8f9" stroke-width="0.65" opacity="0.82" transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${rotation.toFixed(2)})" />`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${STATIC_MAP_WIDTH}" height="${STATIC_MAP_HEIGHT}" viewBox="0 0 ${STATIC_MAP_WIDTH} ${STATIC_MAP_HEIGHT}">
  <defs>
    <linearGradient id="hud" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#020617" stop-opacity="0.62"/>
      <stop offset="55%" stop-color="#020617" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="0.42"/>
    </linearGradient>
  </defs>
  <image href="${escapeXml(satelliteUrl)}" x="0" y="0" width="${STATIC_MAP_WIDTH}" height="${STATIC_MAP_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${STATIC_MAP_WIDTH}" height="${STATIC_MAP_HEIGHT}" fill="url(#hud)"/>
  <g>${panelRects}</g>
</svg>`
}

function latLngToPixel(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
  width: number,
  height: number,
  pixelScale = 1
) {
  const scale = 256 * Math.pow(2, zoom)
  const worldX = ((lng + 180) / 360) * scale
  const worldY =
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) /
        Math.PI) /
      2) *
    scale
  const centerWorldX = ((centerLng + 180) / 360) * scale
  const centerWorldY =
    ((1 -
      Math.log(Math.tan((centerLat * Math.PI) / 180) + 1 / Math.cos((centerLat * Math.PI) / 180)) /
        Math.PI) /
      2) *
    scale

  return {
    x: width / 2 + (worldX - centerWorldX) * pixelScale,
    y: height / 2 + (worldY - centerWorldY) * pixelScale,
  }
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
