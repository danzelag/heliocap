import { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { getGoogleCloudAccessToken } from '@/lib/google-cloud-auth'
import { getGoogleMapsApiKey } from '@/lib/google-maps'
import { uploadLeadAsset } from '@/lib/google-storage'
import type {
  GoogleSolarDataLayers,
  SolarDataLayerAsset,
  SolarGeoBounds,
} from '@/lib/openclaw-google'

export async function fetchSolarDataLayersMetadata(
  lat: number,
  lng: number,
  radiusMeters = 35,
): Promise<GoogleSolarDataLayers | null> {
  const accessToken = await getGoogleCloudAccessToken()
  const url = new URL('https://solar.googleapis.com/v1/dataLayers:get')
  url.searchParams.set('location.latitude', String(lat))
  url.searchParams.set('location.longitude', String(lng))
  url.searchParams.set('radiusMeters', String(radiusMeters))
  url.searchParams.set('view', 'IMAGERY_AND_ANNUAL_FLUX_LAYERS')
  url.searchParams.set('requiredQuality', 'HIGH')
  url.searchParams.set('pixelSizeMeters', '0.25')

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  })

  if (response.status === 404) return null

  if (!response.ok) {
    throw new Error(`Google Solar Data Layers API returned ${response.status}: ${await response.text()}`)
  }

  return response.json()
}

export async function fetchAndUploadSolarDataLayerAssets({
  supabase,
  bucket = 'leads',
  slug,
  lat,
  lng,
}: {
  supabase: SupabaseClient
  bucket?: 'leads' | 'prospects'
  slug: string
  lat: number
  lng: number
}): Promise<{
  metadata: GoogleSolarDataLayers | null
  layers: SolarDataLayerAsset[]
}> {
  const metadata = await fetchSolarDataLayersMetadata(lat, lng)
  if (!metadata) return { metadata: null, layers: [] }

  const layerConfigs = [
    { id: 'rgb' as const, label: 'Solar RGB imagery', url: metadata.rgbUrl },
    { id: 'mask' as const, label: 'Roof mask', url: metadata.maskUrl },
    { id: 'dsm' as const, label: 'DSM height model', url: metadata.dsmUrl },
    { id: 'annualFlux' as const, label: 'Annual sunlight flux', url: metadata.annualFluxUrl },
  ]

  const layers = await Promise.all(layerConfigs.map(async (layer): Promise<SolarDataLayerAsset | null> => {
    if (!layer.url) return null

    try {
      const downloaded = await downloadSolarGeoTiff(layer.url)
      const spatialInfo = await readSolarGeoTiffSpatialInfo(downloaded.buffer).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[openclaw-google] Solar data layer ${layer.id} spatial metadata unavailable: ${message}`)
        return null
      })
      const originalUrl = await uploadLeadAsset({
        supabase,
        bucket,
        slug,
        fileName: `solar-layers/${layer.id}.tif`,
        body: downloaded.buffer,
        contentType: downloaded.contentType,
      })
      const preview = await buildSolarLayerPreview(downloaded.buffer, layer.id)
      const previewMetadata = preview
        ? await sharp(preview).metadata().catch(() => null)
        : null
      const previewUrl = preview
        ? await uploadLeadAsset({
            supabase,
            bucket,
            slug,
            fileName: `solar-layers/${layer.id}.webp`,
            body: preview,
            contentType: 'image/webp',
          })
        : null

      return {
        id: layer.id,
        label: layer.label,
        sourceUrl: layer.url,
        originalUrl,
        previewUrl,
        contentType: downloaded.contentType,
        width: spatialInfo?.width ?? null,
        height: spatialInfo?.height ?? null,
        previewWidth: previewMetadata?.width ?? null,
        previewHeight: previewMetadata?.height ?? null,
        bounds: spatialInfo?.bounds ?? null,
        error: null,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[openclaw-google] Solar data layer ${layer.id} unavailable: ${message}`)
      return {
        id: layer.id,
        label: layer.label,
        sourceUrl: layer.url,
        originalUrl: null,
        previewUrl: null,
        contentType: null,
        width: null,
        height: null,
        previewWidth: null,
        previewHeight: null,
        bounds: null,
        error: message,
      }
    }
  }))

  return {
    metadata,
    layers: layers.filter((layer): layer is SolarDataLayerAsset => Boolean(layer)),
  }
}

async function readSolarGeoTiffSpatialInfo(buffer: Buffer): Promise<{
  width: number
  height: number
  bounds: SolarGeoBounds | null
}> {
  const { fromArrayBuffer } = await import('geotiff')
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
  const tiff = await fromArrayBuffer(arrayBuffer)
  const image = await tiff.getImage()
  const bbox = image.getBoundingBox()
  const geoKeys = image.getGeoKeys()
  const epsgCode = typeof geoKeys?.ProjectedCSTypeGeoKey === 'number'
    ? geoKeys.ProjectedCSTypeGeoKey
    : null
  const bounds = Array.isArray(bbox) && bbox.length === 4
    ? {
        west: Number(bbox[0]),
        south: Number(bbox[1]),
        east: Number(bbox[2]),
        north: Number(bbox[3]),
        epsgCode,
      }
    : null

  return {
    width: image.getWidth(),
    height: image.getHeight(),
    bounds: bounds && isFiniteBounds(bounds) ? bounds : null,
  }
}

function isFiniteBounds(bounds: SolarGeoBounds) {
  return [bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite) &&
    bounds.east !== bounds.west &&
    bounds.north !== bounds.south
}

async function downloadSolarGeoTiff(sourceUrl: string) {
  const url = new URL(sourceUrl)
  const apiKey = getGoogleMapsApiKey()
  if (apiKey && !url.searchParams.has('key')) {
    url.searchParams.set('key', apiKey)
  }

  const accessToken = await getGoogleCloudAccessToken().catch(() => null)
  const response = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`GeoTIFF download returned ${response.status}: ${await response.text()}`)
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/tiff',
  }
}

async function buildSolarLayerPreview(buffer: Buffer, layerId: SolarDataLayerAsset['id']) {
  try {
    const image = sharp(buffer, { limitInputPixels: false }).resize(640, 640, {
      fit: 'inside',
      withoutEnlargement: true,
    })

    if (layerId === 'rgb') {
      return image.webp({ quality: 88, effort: 4 }).toBuffer()
    }

    return image
      .greyscale()
      .normalize()
      .linear(1.35, -12)
      .webp({ quality: 88, effort: 4 })
      .toBuffer()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[openclaw-google] Solar layer preview failed for ${layerId}: ${message}`)
    return null
  }
}
