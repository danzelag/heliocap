import { SupabaseClient } from '@supabase/supabase-js'

const STATIC_MAP_WIDTH = 1280
const STATIC_MAP_HEIGHT = 720
const STATIC_MAP_ZOOM = 18
const PANEL_WIDTH_METERS = 1.045
const PANEL_HEIGHT_METERS = 1.879
const PANEL_WATTS = 400
const COMMERCIAL_COST_PER_WATT = 1.8
const FEDERAL_ITC_RATE = 0.3
const DEFAULT_UTILITY_RATE = 0.14
const DEPLOYABLE_PANEL_RATIO = 0.7

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
}

type UploadAssetArgs = {
  supabase: SupabaseClient
  bucket?: string
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

export async function fetchStaticSatelliteImage(lat: number, lng: number) {
  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY is not configured')
  }

  const url = new URL('https://maps.googleapis.com/maps/api/staticmap')
  url.searchParams.set('center', `${lat},${lng}`)
  url.searchParams.set('zoom', String(STATIC_MAP_ZOOM))
  url.searchParams.set('size', `${STATIC_MAP_WIDTH}x${STATIC_MAP_HEIGHT}`)
  url.searchParams.set('maptype', 'satellite')
  url.searchParams.set('scale', '1')
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
  const fallbackMaxPanelCount = 700
  const maxPanelCount = insights?.solarPotential?.maxArrayPanelsCount || panels.length || fallbackMaxPanelCount
  const deployableCount = Math.floor((panels.length || maxPanelCount) * DEPLOYABLE_PANEL_RATIO)
  const sortedPanels = [...panels].sort((a, b) => (b.yearlyEnergyDcKwh || 0) - (a.yearlyEnergyDcKwh || 0))
  const deployablePanels = sortedPanels.slice(0, deployableCount)
  const yearlyKwhFromPanels = deployablePanels.reduce((sum, panel) => sum + (panel.yearlyEnergyDcKwh || 0), 0)
  const panelCount = deployablePanels.length || deployableCount
  const systemSizeKw = panelCount * (PANEL_WATTS / 1000)
  const yearlyKwh = yearlyKwhFromPanels || Math.round(systemSizeKw * 1450)
  const yearlySavings = Math.round(yearlyKwh * utilityRate)
  const savings25yr = Math.round(yearlySavings * 25 * 1.03)
  const systemCost = Math.round(systemSizeKw * 1000 * COMMERCIAL_COST_PER_WATT)
  const federalItc = Math.round(systemCost * FEDERAL_ITC_RATE)
  const netCost = systemCost - federalItc
  const estimatedPayback = yearlySavings > 0 ? Number((netCost / yearlySavings).toFixed(1)) : 0
  const usableRoofAreaSqft = insights?.solarPotential?.maxArrayAreaMeters2
    ? Math.round(insights.solarPotential.maxArrayAreaMeters2 * 10.7639)
    : null

  return {
    panelCount,
    maxPanelCount,
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
  }
}

export function buildSolarOverlaySvg({
  satelliteUrl,
  insights,
  lat,
  lng,
  model,
}: {
  satelliteUrl: string
  insights: GoogleSolarInsights | null
  lat: number
  lng: number
  model: SolarModel
}) {
  const panels = [...(insights?.solarPotential?.solarPanels || [])]
    .sort((a, b) => (b.yearlyEnergyDcKwh || 0) - (a.yearlyEnergyDcKwh || 0))
    .slice(0, model.panelCount)

  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, STATIC_MAP_ZOOM)
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
        STATIC_MAP_ZOOM,
        STATIC_MAP_WIDTH,
        STATIC_MAP_HEIGHT
      )
      const segment = panel.segmentIndex != null
        ? insights?.solarPotential?.roofSegmentStats?.[panel.segmentIndex]
        : undefined
      const azimuth = segment?.azimuthDegrees || 180
      const rotation = panel.orientation === 'LANDSCAPE' ? azimuth + 90 : azimuth

      return `<rect x="${(-panelWidthPx / 2).toFixed(2)}" y="${(-panelHeightPx / 2).toFixed(2)}" width="${panelWidthPx.toFixed(2)}" height="${panelHeightPx.toFixed(2)}" rx="1.2" fill="#0f172a" stroke="#67e8f9" stroke-width="0.65" opacity="0.82" transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${rotation.toFixed(2)})" />`
    })
    .join('')

  const summary = `${model.panelCount.toLocaleString()} panels · ${model.systemSizeKw.toLocaleString()} kW · $${model.yearlySavings.toLocaleString()} annual savings`

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
  <g transform="translate(32 32)">
    <rect width="560" height="82" fill="#020617" opacity="0.78" stroke="#94a3b8" stroke-opacity="0.28"/>
    <text x="20" y="31" fill="#e2e8f0" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" letter-spacing="2">OPENCLAW SOLAR GEOMETRY</text>
    <text x="20" y="60" fill="#67e8f9" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18">${escapeXml(summary)}</text>
  </g>
</svg>`
}

function latLngToPixel(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
  width: number,
  height: number
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
    x: width / 2 + (worldX - centerWorldX),
    y: height / 2 + (worldY - centerWorldY),
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
