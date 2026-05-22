import { SupabaseClient } from '@supabase/supabase-js'
import {
  calculateHeadingDegrees,
  fetchStreetViewImage,
  getGoogleMapsApiKey,
  normalizeHeadingDegrees,
} from '@/lib/google-maps'
import { uploadLeadAsset } from '@/lib/google-storage'
import type { VisualReferenceSet } from '@/lib/openclaw-google'

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
    solarApiLayoutImageUrl: null as string | null,
  }

  console.log('[openclaw-google] Visual references available', {
    staticSatellite: Boolean(referenceSet.mapTilesImageUrl),
    aerialView: Boolean(referenceSet.aerialViewReferenceUrl),
    streetViewCount: referenceSet.streetViewReferenceUrls.length,
    cleanedPreview: Boolean(referenceSet.cleanedPreviewImageUrl),
  })

  return referenceSet
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
}) {
  const apiKey = getGoogleMapsApiKey()
  if (!apiKey) return []

  const uploadedUrls: string[] = []
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
