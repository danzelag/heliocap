import { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const STATIC_MAP_REQUEST_WIDTH = 640
const STATIC_MAP_REQUEST_HEIGHT = 360
const STATIC_MAP_SCALE = 2
const STATIC_MAP_WIDTH = STATIC_MAP_REQUEST_WIDTH * STATIC_MAP_SCALE
const STATIC_MAP_HEIGHT = STATIC_MAP_REQUEST_HEIGHT * STATIC_MAP_SCALE
const DEFAULT_STATIC_MAP_ZOOM = 19
const MAP_TILE_LOGICAL_SIZE = 256
const MAP_TILE_TARGET_FORMAT = 'png'
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

type MapTilesSession = {
  session?: string
  tileWidth?: number
  tileHeight?: number
  imageFormat?: string
}

export type VisualReferenceSet = {
  mapTilesImageUrl: string | null
  aerialViewReferenceUrl: string | null
  streetViewReferenceUrls: string[]
  cleanedPreviewImageUrl: string | null
}

type CollectVisualReferencesArgs = {
  supabase: SupabaseClient
  bucket?: 'leads' | 'prospects'
  slug: string
  lat: number
  lng: number
  address?: string | null
  mapTilesImageUrl?: string | null
  cleanedPreviewImageUrl?: string | null
}

type AerialViewLookupResponse = {
  state?: string
  uris?: Record<string, {
    landscapeUri?: string
    portraitUri?: string
  }>
}

type StreetViewMetadataResponse = {
  status?: string
  error_message?: string
  pano_id?: string
  location?: {
    lat?: number
    lng?: number
  }
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
  const resolvedBucket = await resolveStorageBucket(supabase, bucket)
  const filePath = `${slug}/${fileName}`
  const { error } = await supabase.storage
    .from(resolvedBucket)
    .upload(filePath, body, { contentType, upsert: true })

  if (error) throw error

  const { data } = supabase.storage.from(resolvedBucket).getPublicUrl(filePath)
  return data.publicUrl
}

export async function listManualStreetViewReferenceUrls({
  supabase,
  prospectId,
}: {
  supabase: SupabaseClient
  prospectId: string
}) {
  const bucket = await resolveStorageBucket(supabase, 'prospects')
  const folder = `${prospectId}/references`
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { limit: 100, sortBy: { column: 'name', order: 'asc' } })

  if (error) {
    console.error(`[openclaw-google] Manual Street View reference listing failed: ${error.message}`)
    return []
  }

  return (data || [])
    .filter((file) => /^manual-street-view-.+\.(jpe?g|png|webp)$/i.test(file.name))
    .map((file) => {
      const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(`${folder}/${file.name}`)
      return publicUrl.publicUrl
    })
}

export async function fetchStreetViewImage({
  pano,
  lat,
  lng,
  heading,
  pitch = 0,
  fov = 70,
}: {
  pano?: string | null
  lat?: number | null
  lng?: number | null
  heading: number
  pitch?: number
  fov?: number
}) {
  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured')
  if (!pano && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
    throw new Error('Street View capture requires a panorama ID or coordinates.')
  }

  const imageUrl = new URL('https://maps.googleapis.com/maps/api/streetview')
  imageUrl.searchParams.set('size', '640x360')
  if (pano) {
    imageUrl.searchParams.set('pano', pano)
  } else {
    imageUrl.searchParams.set('location', `${lat},${lng}`)
  }
  imageUrl.searchParams.set('heading', String(normalizeHeadingDegrees(heading)))
  imageUrl.searchParams.set('fov', String(clampNumber(fov, 20, 120)))
  imageUrl.searchParams.set('pitch', String(clampNumber(pitch, -45, 45)))
  imageUrl.searchParams.set('source', 'outdoor')
  imageUrl.searchParams.set('key', apiKey)

  const response = await fetch(imageUrl, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Street View image returned ${response.status}: ${await response.text()}`)
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg',
  }
}

export async function collectVisualReferences({
  supabase,
  bucket = 'leads',
  slug,
  lat,
  lng,
  address,
  mapTilesImageUrl = null,
  cleanedPreviewImageUrl = null,
}: CollectVisualReferencesArgs): Promise<VisualReferenceSet> {
  const aerialViewReferenceUrl = await fetchAerialViewReference({ address, lat, lng }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[openclaw-google] Aerial View reference unavailable: ${message}`)
    return null
  })

  const streetViewReferenceUrls = await fetchStreetViewReferenceImages({
    supabase,
    bucket,
    slug,
    lat,
    lng,
    address,
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[openclaw-google] Street View references unavailable: ${message}`)
    return []
  })

  const referenceSet = {
    mapTilesImageUrl,
    aerialViewReferenceUrl,
    streetViewReferenceUrls,
    cleanedPreviewImageUrl,
  }

  console.log('[openclaw-google] Visual references available', {
    mapTiles: Boolean(referenceSet.mapTilesImageUrl),
    aerialView: Boolean(referenceSet.aerialViewReferenceUrl),
    streetViewCount: referenceSet.streetViewReferenceUrls.length,
    cleanedPreview: Boolean(referenceSet.cleanedPreviewImageUrl),
  })

  return referenceSet
}

async function resolveStorageBucket(
  supabase: SupabaseClient,
  bucket: NonNullable<UploadAssetArgs['bucket']>,
): Promise<string> {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) throw listError

  const exactMatch = buckets.find((candidate) => candidate.id === bucket || candidate.name === bucket)
  if (exactMatch) return exactMatch.id

  const caseMatch = buckets.find((candidate) => (
    candidate.id.toLowerCase() === bucket.toLowerCase() ||
    candidate.name.toLowerCase() === bucket.toLowerCase()
  ))
  if (caseMatch) return caseMatch.id

  const { error: createError } = await supabase.storage.createBucket(bucket, { public: true })
  if (createError) throw createError

  return bucket
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

export async function fetchStaticSatelliteImage(
  lat: number,
  lng: number,
  zoom = DEFAULT_STATIC_MAP_ZOOM,
): Promise<Buffer> {
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

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Google Maps Static API returned ${response.status}: ${await response.text()}`)
    }

    console.log(`[openclaw-google] Satellite source: static_maps zoom=${zoom} lat=${lat} lng=${lng}`)
    return Buffer.from(await response.arrayBuffer())
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[openclaw-google] Static Maps failed, using Map Tiles fallback: ${message}`)
  }

  const image = await fetchMapTilesSatelliteImage({ lat, lng, zoom, apiKey })
  console.log(`[openclaw-google] Satellite source: map_tiles_fallback zoom=${zoom} lat=${lat} lng=${lng}`)
  return image
}

async function fetchAerialViewReference({
  address,
  lat,
  lng,
}: {
  address?: string | null
  lat: number
  lng: number
}) {
  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) return null

  const lookupAddress = address?.trim() || `${lat},${lng}`
  const url = new URL('https://aerialview.googleapis.com/v1/videos:lookupVideo')
  url.searchParams.set('address', lookupAddress)
  url.searchParams.set('key', apiKey)

  const response = await fetch(url, { cache: 'no-store' })
  if (response.status === 404) {
    console.log('[openclaw-google] Aerial View reference unavailable: no active video for address')
    return null
  }
  if (!response.ok) {
    throw new Error(`Aerial View lookup returned ${response.status}: ${await response.text()}`)
  }

  const data = (await response.json()) as AerialViewLookupResponse
  if (data.state && data.state !== 'ACTIVE') {
    console.log(`[openclaw-google] Aerial View reference unavailable: state=${data.state}`)
    return null
  }

  const media = Object.values(data.uris || {})
  const landscapeUri = media.find((entry) => entry.landscapeUri)?.landscapeUri || null
  if (landscapeUri) {
    console.log('[openclaw-google] Aerial View reference available')
  }

  return landscapeUri
}

async function fetchStreetViewReferenceImages({
  supabase,
  bucket,
  slug,
  lat,
  lng,
}: {
  supabase: SupabaseClient
  bucket: 'leads' | 'prospects'
  slug: string
  lat: number
  lng: number
  address?: string | null
}) {
  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) return []

  const uploadedUrls: string[] = []
  // Use the verified visual coordinates, not address text, so Street View anchors
  // stay tied to the exact roof the admin selected.
  const location = `${lat},${lng}`

  try {
    const metadataUrl = new URL('https://maps.googleapis.com/maps/api/streetview/metadata')
    metadataUrl.searchParams.set('location', location)
    metadataUrl.searchParams.set('source', 'outdoor')
    metadataUrl.searchParams.set('key', apiKey)

    const metadataResponse = await fetch(metadataUrl, { cache: 'no-store' })
    if (!metadataResponse.ok) {
      throw new Error(`metadata returned ${metadataResponse.status}: ${await metadataResponse.text()}`)
    }

    const metadata = (await metadataResponse.json()) as StreetViewMetadataResponse
    if (metadata.status !== 'OK') {
      console.log(`[openclaw-google] Street View unavailable: ${metadata.status || 'unknown'}`)
      return []
    }

    const panoLat = metadata.location?.lat
    const panoLng = metadata.location?.lng
    const baseHeading = typeof panoLat === 'number' && typeof panoLng === 'number'
      ? calculateHeadingDegrees(panoLat, panoLng, lat, lng)
      : 0
    const headings = [
      baseHeading,
      baseHeading - 28,
      baseHeading + 28,
      baseHeading - 55,
      baseHeading + 55,
    ].map(normalizeHeadingDegrees)

    console.log('[openclaw-google] Street View panorama selected', {
      panoId: metadata.pano_id,
      targetLat: lat,
      targetLng: lng,
      panoLat,
      panoLng,
      facingHeading: Math.round(baseHeading),
    })

    for (const heading of headings) {
      const image = await fetchStreetViewImage({
        pano: metadata.pano_id,
        lat,
        lng,
        heading,
        pitch: 4,
        fov: 70,
      })
      const publicUrl = await uploadLeadAsset({
        supabase,
        bucket,
        slug,
        fileName: `references/street-view-facing-${Math.round(heading)}.jpg`,
        body: image.buffer,
        contentType: image.contentType,
      })
      uploadedUrls.push(publicUrl)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[openclaw-google] Street View reference collection failed: ${message}`)
  }

  if (uploadedUrls.length) {
    console.log(`[openclaw-google] Street View references available: ${uploadedUrls.length}`)
  }

  return uploadedUrls
}

function calculateHeadingDegrees(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const toDeg = (radians: number) => (radians * 180) / Math.PI
  const lat1 = toRad(fromLat)
  const lat2 = toRad(toLat)
  const deltaLng = toRad(toLng - fromLng)
  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)

  return normalizeHeadingDegrees(toDeg(Math.atan2(y, x)))
}

function normalizeHeadingDegrees(heading: number) {
  return ((heading % 360) + 360) % 360
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

async function fetchMapTilesSatelliteImage({
  lat,
  lng,
  zoom,
  apiKey,
}: {
  lat: number
  lng: number
  zoom: number
  apiKey: string
}) {
  const session = await createMapTilesSatelliteSession(apiKey)
  const tileWidth = session.tileWidth || MAP_TILE_LOGICAL_SIZE
  const tileHeight = session.tileHeight || tileWidth
  const pixelScale = tileWidth / MAP_TILE_LOGICAL_SIZE
  const centerWorld = latLngToWorldPixel(lat, lng, zoom)
  const centerTileX = Math.floor(centerWorld.x / MAP_TILE_LOGICAL_SIZE)
  const centerTileY = Math.floor(centerWorld.y / MAP_TILE_LOGICAL_SIZE)
  const offsetX = (centerWorld.x - centerTileX * MAP_TILE_LOGICAL_SIZE) * pixelScale
  const offsetY = (centerWorld.y - centerTileY * MAP_TILE_LOGICAL_SIZE) * pixelScale
  const radiusX = Math.ceil(STATIC_MAP_WIDTH / tileWidth / 2) + 1
  const radiusY = Math.ceil(STATIC_MAP_HEIGHT / tileHeight / 2) + 1
  const startTileX = centerTileX - radiusX
  const startTileY = centerTileY - radiusY
  const columns = radiusX * 2 + 1
  const rows = radiusY * 2 + 1
  const tiles = await Promise.all(
    Array.from({ length: columns * rows }, async (_, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const x = startTileX + column
      const y = startTileY + row
      const input = await fetchMapTile({
        apiKey,
        session: session.session!,
        zoom,
        x,
        y,
      })

      return {
        input,
        left: column * tileWidth,
        top: row * tileHeight,
      }
    }),
  )
  const mosaicWidth = columns * tileWidth
  const mosaicHeight = rows * tileHeight
  const mosaicCenterX = (centerTileX - startTileX) * tileWidth + offsetX
  const mosaicCenterY = (centerTileY - startTileY) * tileHeight + offsetY
  const cropLeft = clamp(Math.round(mosaicCenterX - STATIC_MAP_WIDTH / 2), 0, mosaicWidth - STATIC_MAP_WIDTH)
  const cropTop = clamp(Math.round(mosaicCenterY - STATIC_MAP_HEIGHT / 2), 0, mosaicHeight - STATIC_MAP_HEIGHT)

  return sharp({
    create: {
      width: mosaicWidth,
      height: mosaicHeight,
      channels: 3,
      background: '#111111',
    },
  })
    .composite(tiles)
    .extract({
      left: cropLeft,
      top: cropTop,
      width: STATIC_MAP_WIDTH,
      height: STATIC_MAP_HEIGHT,
    })
    .sharpen()
    .png()
    .toBuffer()
}

async function createMapTilesSatelliteSession(apiKey: string): Promise<Required<MapTilesSession>> {
  const url = new URL('https://tile.googleapis.com/v1/createSession')
  url.searchParams.set('key', apiKey)

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mapType: 'satellite',
      language: 'en-US',
      region: 'US',
      imageFormat: MAP_TILE_TARGET_FORMAT,
      scale: 'scaleFactor2x',
      highDpi: true,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Map Tiles createSession returned ${response.status}: ${await response.text()}`)
  }

  const session = (await response.json()) as MapTilesSession
  if (!session.session) {
    throw new Error('Map Tiles createSession did not return a session token')
  }

  return {
    session: session.session,
    tileWidth: session.tileWidth || MAP_TILE_LOGICAL_SIZE,
    tileHeight: session.tileHeight || session.tileWidth || MAP_TILE_LOGICAL_SIZE,
    imageFormat: session.imageFormat || MAP_TILE_TARGET_FORMAT,
  }
}

async function fetchMapTile({
  apiKey,
  session,
  zoom,
  x,
  y,
}: {
  apiKey: string
  session: string
  zoom: number
  x: number
  y: number
}) {
  const url = new URL(`https://tile.googleapis.com/v1/2dtiles/${zoom}/${x}/${y}`)
  url.searchParams.set('session', session)
  url.searchParams.set('key', apiKey)

  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Map Tiles tile ${zoom}/${x}/${y} returned ${response.status}: ${await response.text()}`)
  }

  return Buffer.from(await response.arrayBuffer())
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
  const guidePanels = samplePanelsForGuide(panels, MAX_GUIDE_PANEL_MARKERS)

  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom) / STATIC_MAP_SCALE
  const panelWidthPx = Math.max(4, PANEL_WIDTH_METERS / metersPerPixel)
  const panelHeightPx = Math.max(7, PANEL_HEIGHT_METERS / metersPerPixel)

  const panelRects = guidePanels
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

      return `<rect x="${(-panelWidthPx / 2).toFixed(2)}" y="${(-panelHeightPx / 2).toFixed(2)}" width="${panelWidthPx.toFixed(2)}" height="${panelHeightPx.toFixed(2)}" rx="1.2" fill="#0f172a" stroke="#bae6fd" stroke-width="0.35" opacity="0.58" transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${rotation.toFixed(2)})" />`
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

function samplePanelsForGuide(panels: GoogleSolarPanel[], maxPanels: number) {
  if (panels.length <= maxPanels) return panels
  const stride = Math.ceil(panels.length / maxPanels)
  return panels.filter((_, index) => index % stride === 0).slice(0, maxPanels)
}

function latLngToWorldPixel(lat: number, lng: number, zoom: number) {
  const scale = MAP_TILE_LOGICAL_SIZE * Math.pow(2, zoom)
  const sinLat = Math.sin((lat * Math.PI) / 180)
  const clampedSinLat = clamp(sinLat, -0.9999, 0.9999)

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + clampedSinLat) / (1 - clampedSinLat)) / (4 * Math.PI)) * scale,
  }
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
