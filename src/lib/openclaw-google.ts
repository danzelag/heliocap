import sharp from 'sharp'
import {
  STATIC_MAP_HEIGHT,
  STATIC_MAP_SCALE,
  STATIC_MAP_WIDTH,
  getGoogleMapsApiKey,
} from '@/lib/google-maps'
export { fetchStaticSatelliteImage, fetchStreetViewImage } from '@/lib/google-maps'
export { listManualStreetViewReferenceUrls, uploadLeadAsset } from '@/lib/google-storage'
export { collectVisualReferences } from '@/lib/google-visual-references'
export { fetchAndUploadSolarDataLayerAssets, fetchSolarDataLayersMetadata } from '@/lib/google-solar-data'

const MAX_GUIDE_PANEL_MARKERS = 260
const MAX_SOLAR_CENTER_DRIFT_METERS = 75
const WARN_SOLAR_CENTER_DRIFT_METERS = 30
const PANEL_WIDTH_METERS = 1.045
const PANEL_HEIGHT_METERS = 1.879
const PANEL_WATTS = 400
const COMMERCIAL_COST_PER_WATT = 1.8
const FEDERAL_ITC_RATE = 0.3
const DEFAULT_UTILITY_RATE = 0.18 // Ontario all-in commercial rate (electricity + Global Adjustment + delivery)
const PANEL_AREA_SQFT = PANEL_WIDTH_METERS * PANEL_HEIGHT_METERS * 10.7639
const COMMERCIAL_ROOF_UTILIZATION = 0.42
const PANEL_LAYOUT_AREA_MULTIPLIER = 1.75
const DEPLOYABLE_PANEL_RATIO = 1
const MAX_RESIDENTIAL_LAYOUT_SEGMENTS = 2
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

export type VisualReferenceSet = {
  mapTilesImageUrl: string | null
  aerialViewReferenceUrl: string | null
  streetViewReferenceUrls: string[]
  cleanedPreviewImageUrl: string | null
  solarApiLayoutImageUrl: string | null
}

export type GoogleSolarDataLayers = {
  imageryDate?: {
    year?: number
    month?: number
    day?: number
  }
  imageryProcessedDate?: {
    year?: number
    month?: number
    day?: number
  }
  dsmUrl?: string
  rgbUrl?: string
  maskUrl?: string
  annualFluxUrl?: string
  monthlyFluxUrl?: string
  hourlyShadeUrls?: string[]
  imageryQuality?: string
}

export type SolarDataLayerAsset = {
  id: 'rgb' | 'mask' | 'dsm' | 'annualFlux'
  label: string
  sourceUrl: string
  originalUrl: string | null
  previewUrl: string | null
  contentType: string | null
  width?: number | null
  height?: number | null
  previewWidth?: number | null
  previewHeight?: number | null
  bounds?: SolarGeoBounds | null
  error?: string | null
}

export type SolarGeoBounds = {
  west: number
  south: number
  east: number
  north: number
  epsgCode?: number | null
}

export type SolarRasterPlacement = {
  bounds: SolarGeoBounds
  sourceWidth: number
  sourceHeight: number
  sourceLeft?: number
  sourceTop?: number
  cropWidth?: number
  cropHeight?: number
  renderedWidth: number
  renderedHeight: number
  left: number
  top: number
}

export type SolarRoofFocusCrop = {
  left: number
  top: number
  width: number
  height: number
}


export async function buildRasterRenderPreview(renderSvg: string) {
  const preview = await sharp(Buffer.from(renderSvg))
    .resize(1280, 720, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: 78,
      effort: 4,
    })
    .toBuffer()

  return coverMapAttributionBand(preview, 'webp')
}

export async function coverMapAttributionBand(buffer: Buffer, format: 'png' | 'webp' = 'png') {
  const width = STATIC_MAP_WIDTH
  const height = STATIC_MAP_HEIGHT
  const bandHeight = 66
  const patchTop = Math.max(0, height - bandHeight * 2)
  const base = sharp(buffer).resize(width, height, { fit: 'cover', position: 'center' })
  const patch = await sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .extract({ left: 0, top: patchTop, width, height: bandHeight })
    .blur(10)
    .modulate({ brightness: 0.98, saturation: 0.9 })
    .toBuffer()

  const composited = base.composite([{ input: patch, left: 0, top: height - bandHeight }])

  if (format === 'webp') {
    return composited.webp({ quality: 90, effort: 4 }).toBuffer()
  }

  return composited.png().toBuffer()
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
    const driftMeters = calculateDistanceMeters(
      fallbackLat,
      fallbackLng,
      center.latitude,
      center.longitude,
    )

    if (driftMeters <= MAX_SOLAR_CENTER_DRIFT_METERS) {
      console.log('[openclaw-google] Solar center observed; keeping prospect coordinates for visual target', {
        requestedLat: fallbackLat,
        requestedLng: fallbackLng,
        solarLat: center.latitude,
        solarLng: center.longitude,
        driftMeters: Math.round(driftMeters),
        moderateDrift: driftMeters > WARN_SOLAR_CENTER_DRIFT_METERS,
      })

      return {
        lat: fallbackLat,
        lng: fallbackLng,
        source: 'prospect_coordinates' as const,
        observedSolarCenter: {
          lat: center.latitude,
          lng: center.longitude,
          driftMeters,
        },
        needsReview: driftMeters > WARN_SOLAR_CENTER_DRIFT_METERS,
      }
    }

    console.warn('[openclaw-google] Solar center too far from prospect coordinates; keeping prospect visual target', {
      requestedLat: fallbackLat,
      requestedLng: fallbackLng,
      solarLat: center.latitude,
      solarLng: center.longitude,
      driftMeters: Math.round(driftMeters),
      maxAllowedMeters: MAX_SOLAR_CENTER_DRIFT_METERS,
    })

    return {
      lat: fallbackLat,
      lng: fallbackLng,
      source: 'prospect_coordinates' as const,
      rejectedSolarCenter: {
        lat: center.latitude,
        lng: center.longitude,
        driftMeters,
      },
    }
  }

  return {
    lat: fallbackLat,
    lng: fallbackLng,
    source: 'prospect_coordinates' as const,
  }
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
  const deployableCount = Math.max(0, Math.ceil(Math.min(panels.length || maxPanelCount, maxPanelCount) * DEPLOYABLE_PANEL_RATIO))
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
  const panelRects = buildSolarPanelRects({ insights, lat, lng, model, zoom })

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${STATIC_MAP_WIDTH}" height="${STATIC_MAP_HEIGHT}" viewBox="0 0 ${STATIC_MAP_WIDTH} ${STATIC_MAP_HEIGHT}">
  ${buildSolarPanelDefs()}
  <image href="${escapeXml(satelliteUrl)}" x="0" y="0" width="${STATIC_MAP_WIDTH}" height="${STATIC_MAP_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
  <g>${panelRects}</g>
</svg>`
}

export function buildSolarPanelLayerSvg({
  insights,
  lat,
  lng,
  model,
  zoom = selectStaticMapZoom(model),
  width = STATIC_MAP_WIDTH,
  height = STATIC_MAP_HEIGHT,
  rasterPlacement,
}: {
  insights: GoogleSolarInsights | null
  lat?: number
  lng?: number
  model: SolarModel
  zoom?: number
  width?: number
  height?: number
  rasterPlacement?: SolarRasterPlacement | null
}) {
  const panelRects = buildSolarPanelRects({
    insights,
    lat: lat ?? insights?.center?.latitude ?? 0,
    lng: lng ?? insights?.center?.longitude ?? 0,
    model,
    zoom,
    width,
    height,
    rasterPlacement,
  })

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${buildSolarPanelDefs()}
  <g>${panelRects}</g>
</svg>`
}

function buildSolarPanelDefs() {
  return `<defs>
    <linearGradient id="panelBlack" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#27272a"/>
      <stop offset="48%" stop-color="#09090b"/>
      <stop offset="100%" stop-color="#18181b"/>
    </linearGradient>
    <filter id="panelShadow" x="-35%" y="-35%" width="170%" height="170%">
      <feDropShadow dx="0.65" dy="0.9" stdDeviation="0.65" flood-color="#000000" flood-opacity="0.42"/>
    </filter>
  </defs>`
}

function buildSolarPanelRects({
  insights,
  lat,
  lng,
  model,
  zoom,
  width = STATIC_MAP_WIDTH,
  height = STATIC_MAP_HEIGHT,
  rasterPlacement,
}: {
  insights: GoogleSolarInsights | null
  lat: number
  lng: number
  model: SolarModel
  zoom: number
  width?: number
  height?: number
  rasterPlacement?: SolarRasterPlacement | null
}) {
  const roofSegments = insights?.solarPotential?.roofSegmentStats || []
  const panels = selectCoherentPanelLayout(
    insights?.solarPotential?.solarPanels || [],
    roofSegments,
    model.panelCount,
  )
  const guidePanels = samplePanelsForGuide(panels, MAX_GUIDE_PANEL_MARKERS)

  const metersPerPixel = rasterPlacement
    ? getRasterMetersPerOutputPixel(rasterPlacement)
    : (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom) / STATIC_MAP_SCALE
  const panelWidthPx = Math.max(4, PANEL_WIDTH_METERS / metersPerPixel)
  const panelHeightPx = Math.max(7, PANEL_HEIGHT_METERS / metersPerPixel)

  return guidePanels
    .map((panel) => {
      if (!panel.center) return ''
      const point = rasterPlacement
        ? latLngToRasterOutputPixel(panel.center.latitude, panel.center.longitude, rasterPlacement)
        : latLngToPixel(
            panel.center.latitude,
            panel.center.longitude,
            lat,
            lng,
            zoom,
            width,
            height,
            STATIC_MAP_SCALE,
          )
      const segment = panel.segmentIndex != null
        ? insights?.solarPotential?.roofSegmentStats?.[panel.segmentIndex]
        : undefined
      const azimuth = segment?.azimuthDegrees || 180
      const rotation = getPanelSvgRotation(azimuth, panel.orientation)

      const x = (-panelWidthPx / 2).toFixed(2)
      const y = (-panelHeightPx / 2).toFixed(2)
      const rectWidth = panelWidthPx.toFixed(2)
      const rectHeight = panelHeightPx.toFixed(2)
      const innerX = (-panelWidthPx / 2 + 1).toFixed(2)
      const innerY = (-panelHeightPx / 2 + 1).toFixed(2)
      const innerWidth = Math.max(1, panelWidthPx - 2).toFixed(2)
      const innerHeight = Math.max(1, panelHeightPx - 2).toFixed(2)
      const dividerOffset = (panelWidthPx / 6).toFixed(2)

      return `<g transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${rotation.toFixed(2)})">
        <rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}" rx="1.1" fill="url(#panelBlack)" stroke="#3f3f46" stroke-width="0.45" opacity="0.94" filter="url(#panelShadow)"/>
        <rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" rx="0.7" fill="none" stroke="#18181b" stroke-width="0.35" opacity="0.8"/>
        <path d="M ${(-Number(dividerOffset)).toFixed(2)} ${y} V ${(panelHeightPx / 2).toFixed(2)} M ${dividerOffset} ${y} V ${(panelHeightPx / 2).toFixed(2)}" stroke="#52525b" stroke-width="0.22" opacity="0.55"/>
      </g>`
    })
    .join('')
}

export function buildSolarLayoutDebug(insights: GoogleSolarInsights | null, model: SolarModel) {
  const roofSegments = insights?.solarPotential?.roofSegmentStats || []
  const sourcePanels = insights?.solarPotential?.solarPanels || []
  const selectedPanels = selectCoherentPanelLayout(sourcePanels, roofSegments, model.panelCount)
  const selectedSegmentCounts = countPanelsBySegment(selectedPanels)
  const sourceSegmentCounts = countPanelsBySegment(sourcePanels.filter((panel) => Boolean(panel.center)))

  return {
    source: insights ? 'google_solar_building_insights' : 'fallback_no_google_solar',
    apiPanelCandidates: sourcePanels.length,
    requestedPanelCount: model.panelCount,
    selectedPanelCount: selectedPanels.length,
    selectedSegments: [...selectedSegmentCounts.entries()].map(([segmentIndex, selectedCount]) => ({
      segmentIndex,
      selectedCount,
      apiCandidateCount: sourceSegmentCounts.get(segmentIndex) || 0,
      azimuthDegrees: roofSegments[segmentIndex]?.azimuthDegrees ?? null,
      pitchDegrees: roofSegments[segmentIndex]?.pitchDegrees ?? null,
      areaMeters2: roofSegments[segmentIndex]?.stats?.areaMeters2 ?? null,
    })),
    allSegments: roofSegments.map((segment, index) => ({
      segmentIndex: index,
      apiCandidateCount: sourceSegmentCounts.get(index) || 0,
      azimuthDegrees: segment.azimuthDegrees ?? null,
      pitchDegrees: segment.pitchDegrees ?? null,
      areaMeters2: segment.stats?.areaMeters2 ?? null,
    })),
    selectedPanels: selectedPanels.slice(0, 80).map((panel, index) => ({
      index,
      segmentIndex: panel.segmentIndex ?? null,
      latitude: panel.center?.latitude ?? null,
      longitude: panel.center?.longitude ?? null,
      orientation: panel.orientation ?? null,
      yearlyEnergyDcKwh: panel.yearlyEnergyDcKwh ?? null,
    })),
  }
}

export function getSolarRoofFocusCrop({
  insights,
  model,
  layer,
}: {
  insights: GoogleSolarInsights | null
  model: SolarModel
  layer: {
    bounds: SolarGeoBounds
    previewWidth: number
    previewHeight: number
  }
}): SolarRoofFocusCrop | null {
  const roofSegments = insights?.solarPotential?.roofSegmentStats || []
  const panels = selectCoherentPanelLayout(
    insights?.solarPotential?.solarPanels || [],
    roofSegments,
    model.panelCount,
  ).filter((panel) => Boolean(panel.center))

  if (!panels.length) return null

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const panel of panels) {
    if (!panel.center) continue
    const point = latLngToRasterSourcePixel(
      panel.center.latitude,
      panel.center.longitude,
      layer.bounds,
      layer.previewWidth,
      layer.previewHeight,
    )
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }

  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const paddingX = Math.max(72, spanX * 1.15)
  const paddingY = Math.max(72, spanY * 1.15)

  const left = clamp(Math.floor(minX - paddingX), 0, Math.max(0, layer.previewWidth - 1))
  const top = clamp(Math.floor(minY - paddingY), 0, Math.max(0, layer.previewHeight - 1))
  const right = clamp(Math.ceil(maxX + paddingX), left + 1, layer.previewWidth)
  const bottom = clamp(Math.ceil(maxY + paddingY), top + 1, layer.previewHeight)

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function selectCoherentPanelLayout(
  allPanels: GoogleSolarPanel[],
  roofSegments: GoogleRoofSegment[],
  targetPanelCount: number,
) {
  const centeredPanels = allPanels.filter((panel) => Boolean(panel.center))
  const segmentedPanels = centeredPanels.filter((panel) => (
    panel.segmentIndex != null && Boolean(roofSegments[panel.segmentIndex])
  ))
  const candidatePanels = segmentedPanels.length ? segmentedPanels : centeredPanels

  if (!candidatePanels.length) return []
  if (!segmentedPanels.length) {
    return [...candidatePanels]
      .sort((a, b) => (b.yearlyEnergyDcKwh || 0) - (a.yearlyEnergyDcKwh || 0))
      .slice(0, targetPanelCount)
  }

  const groups = new Map<number, GoogleSolarPanel[]>()
  for (const panel of segmentedPanels) {
    const segmentIndex = panel.segmentIndex
    if (segmentIndex == null) continue
    groups.set(segmentIndex, [...(groups.get(segmentIndex) || []), panel])
  }

  const rankedGroups = [...groups.entries()]
    .map(([segmentIndex, panels]) => ({
      segmentIndex,
      panels,
      count: panels.length,
      yearlyEnergy: panels.reduce((sum, panel) => sum + (panel.yearlyEnergyDcKwh || 0), 0),
      azimuth: roofSegments[segmentIndex]?.azimuthDegrees ?? 180,
    }))
    .sort((a, b) => {
      const countDelta = b.count - a.count
      if (countDelta !== 0) return countDelta
      return b.yearlyEnergy - a.yearlyEnergy
    })

  const selectedGroups = rankedGroups.slice(0, MAX_RESIDENTIAL_LAYOUT_SEGMENTS)
  const primaryGroup = selectedGroups[0]
  if (!primaryGroup) return []

  const primaryPanels = sortPanelsIntoRoofRows(primaryGroup.panels, roofSegments[primaryGroup.segmentIndex])
  if (primaryPanels.length >= targetPanelCount) {
    return primaryPanels.slice(0, targetPanelCount)
  }

  const overflowPanels = selectedGroups.slice(1).flatMap((group) => {
    const segment = roofSegments[group.segmentIndex]
    return sortPanelsIntoRoofRows(group.panels, segment)
  })

  return [...primaryPanels, ...overflowPanels].slice(0, targetPanelCount)
}

function countPanelsBySegment(panels: GoogleSolarPanel[]) {
  const counts = new Map<number, number>()
  for (const panel of panels) {
    if (panel.segmentIndex == null) continue
    counts.set(panel.segmentIndex, (counts.get(panel.segmentIndex) || 0) + 1)
  }
  return counts
}

function sortPanelsIntoRoofRows(panels: GoogleSolarPanel[], segment?: GoogleRoofSegment) {
  const azimuth = segment?.azimuthDegrees ?? 180
  const angle = ((azimuth - 90) * Math.PI) / 180
  const alongX = Math.cos(angle)
  const alongY = Math.sin(angle)
  const acrossX = -alongY
  const acrossY = alongX

  return [...panels].sort((a, b) => {
    if (!a.center || !b.center) return 0
    const ax = a.center.longitude
    const ay = a.center.latitude
    const bx = b.center.longitude
    const by = b.center.latitude
    const aRow = ax * acrossX + ay * acrossY
    const bRow = bx * acrossX + by * acrossY
    const rowDelta = bRow - aRow
    if (Math.abs(rowDelta) > 0.00001) return rowDelta
    const aColumn = ax * alongX + ay * alongY
    const bColumn = bx * alongX + by * alongY
    return aColumn - bColumn
  })
}

function getPanelSvgRotation(azimuth: number, orientation?: string) {
  const rotation = azimuth - 90 + (orientation === 'LANDSCAPE' ? 90 : 0)
  return ((rotation % 360) + 360) % 360
}

function latLngToRasterOutputPixel(lat: number, lng: number, placement: SolarRasterPlacement) {
  const rasterCoordinate = latLngToRasterCoordinate(lat, lng, placement.bounds)
  const sourceX = ((rasterCoordinate.x - placement.bounds.west) / (placement.bounds.east - placement.bounds.west)) * placement.sourceWidth
  const sourceY = ((placement.bounds.north - rasterCoordinate.y) / (placement.bounds.north - placement.bounds.south)) * placement.sourceHeight
  const croppedSourceX = sourceX - (placement.sourceLeft || 0)
  const croppedSourceY = sourceY - (placement.sourceTop || 0)
  const cropWidth = placement.cropWidth || placement.sourceWidth
  const cropHeight = placement.cropHeight || placement.sourceHeight

  return {
    x: placement.left + croppedSourceX * (placement.renderedWidth / cropWidth),
    y: placement.top + croppedSourceY * (placement.renderedHeight / cropHeight),
  }
}

function latLngToRasterSourcePixel(
  lat: number,
  lng: number,
  bounds: SolarGeoBounds,
  sourceWidth: number,
  sourceHeight: number,
) {
  const rasterCoordinate = latLngToRasterCoordinate(lat, lng, bounds)

  return {
    x: ((rasterCoordinate.x - bounds.west) / (bounds.east - bounds.west)) * sourceWidth,
    y: ((bounds.north - rasterCoordinate.y) / (bounds.north - bounds.south)) * sourceHeight,
  }
}

function getRasterMetersPerOutputPixel(placement: SolarRasterPlacement) {
  if (isProjectedUtmBounds(placement.bounds)) {
    const widthMeters = Math.abs(placement.bounds.east - placement.bounds.west)
    const heightMeters = Math.abs(placement.bounds.north - placement.bounds.south)
    const metersPerSourcePixel = Math.max(
      widthMeters / Math.max(placement.sourceWidth, 1),
      heightMeters / Math.max(placement.sourceHeight, 1),
    )
    const outputScale = placement.renderedWidth / Math.max(placement.cropWidth || placement.sourceWidth, 1)

    return metersPerSourcePixel / Math.max(outputScale, 0.0001)
  }

  const midLat = (placement.bounds.north + placement.bounds.south) / 2
  const metersPerDegreeLat = 111_320
  const metersPerDegreeLng = 111_320 * Math.cos((midLat * Math.PI) / 180)
  const widthMeters = Math.abs(placement.bounds.east - placement.bounds.west) * metersPerDegreeLng
  const heightMeters = Math.abs(placement.bounds.north - placement.bounds.south) * metersPerDegreeLat
  const metersPerSourcePixel = Math.max(
    widthMeters / Math.max(placement.sourceWidth, 1),
    heightMeters / Math.max(placement.sourceHeight, 1),
  )
  const outputScale = placement.renderedWidth / Math.max(placement.cropWidth || placement.sourceWidth, 1)

  return metersPerSourcePixel / Math.max(outputScale, 0.0001)
}

function latLngToRasterCoordinate(lat: number, lng: number, bounds: SolarGeoBounds) {
  if (isProjectedUtmBounds(bounds)) {
    return latLngToUtm(lat, lng, bounds.epsgCode!)
  }

  return { x: lng, y: lat }
}

function isProjectedUtmBounds(bounds: SolarGeoBounds) {
  return typeof bounds.epsgCode === 'number' &&
    ((bounds.epsgCode >= 32601 && bounds.epsgCode <= 32660) ||
      (bounds.epsgCode >= 32701 && bounds.epsgCode <= 32760))
}

function latLngToUtm(lat: number, lng: number, epsgCode: number) {
  const zone = epsgCode % 100
  const northernHemisphere = epsgCode >= 32601 && epsgCode <= 32660
  const a = 6378137
  const f = 1 / 298.257223563
  const k0 = 0.9996
  const e = Math.sqrt(f * (2 - f))
  const ePrimeSquared = (e * e) / (1 - e * e)
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  const originLngRad = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180
  const n = a / Math.sqrt(1 - e * e * Math.sin(latRad) * Math.sin(latRad))
  const t = Math.tan(latRad) * Math.tan(latRad)
  const c = ePrimeSquared * Math.cos(latRad) * Math.cos(latRad)
  const lngDelta = Math.cos(latRad) * (lngRad - originLngRad)
  const meridianArc = a * (
    (1 - e * e / 4 - 3 * e ** 4 / 64 - 5 * e ** 6 / 256) * latRad -
    (3 * e * e / 8 + 3 * e ** 4 / 32 + 45 * e ** 6 / 1024) * Math.sin(2 * latRad) +
    (15 * e ** 4 / 256 + 45 * e ** 6 / 1024) * Math.sin(4 * latRad) -
    (35 * e ** 6 / 3072) * Math.sin(6 * latRad)
  )
  const easting = k0 * n * (
    lngDelta +
    (1 - t + c) * lngDelta ** 3 / 6 +
    (5 - 18 * t + t * t + 72 * c - 58 * ePrimeSquared) * lngDelta ** 5 / 120
  ) + 500_000
  let northing = k0 * (
    meridianArc + n * Math.tan(latRad) * (
      lngDelta * lngDelta / 2 +
      (5 - t + 9 * c + 4 * c * c) * lngDelta ** 4 / 24 +
      (61 - 58 * t + t * t + 600 * c - 330 * ePrimeSquared) * lngDelta ** 6 / 720
    )
  )

  if (!northernHemisphere) northing += 10_000_000

  return { x: easting, y: northing }
}

function samplePanelsForGuide(panels: GoogleSolarPanel[], maxPanels: number) {
  if (panels.length <= maxPanels) return panels
  const stride = Math.ceil(panels.length / maxPanels)
  return panels.filter((_, index) => index % stride === 0).slice(0, maxPanels)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusMeters = 6371000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(lat2 - lat1)
  const deltaLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2)

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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
