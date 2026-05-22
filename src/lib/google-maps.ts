export const STATIC_MAP_REQUEST_WIDTH = 640
export const STATIC_MAP_REQUEST_HEIGHT = 360
export const STATIC_MAP_SCALE = 2
export const STATIC_MAP_WIDTH = STATIC_MAP_REQUEST_WIDTH * STATIC_MAP_SCALE
export const STATIC_MAP_HEIGHT = STATIC_MAP_REQUEST_HEIGHT * STATIC_MAP_SCALE
export const DEFAULT_STATIC_MAP_ZOOM = 19

export function getGoogleMapsApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_STATIC_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  )
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

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Google Maps Static API returned ${response.status}: ${await response.text()}`)
  }

  console.log(`[openclaw-google] Satellite source: static_maps zoom=${zoom} lat=${lat} lng=${lng}`)
  return Buffer.from(await response.arrayBuffer())
}

export function calculateHeadingDegrees(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180
  const toDeg = (radians: number) => (radians * 180) / Math.PI
  const lat1 = toRad(fromLat)
  const lat2 = toRad(toLat)
  const deltaLng = toRad(toLng - fromLng)
  const y = Math.sin(deltaLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng)

  return normalizeHeadingDegrees(toDeg(Math.atan2(y, x)))
}

export function normalizeHeadingDegrees(heading: number) {
  return ((heading % 360) + 360) % 360
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
