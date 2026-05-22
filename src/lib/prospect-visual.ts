import { createAdminClient } from '@/lib/supabase-server'
import {
  buildSolarModel,
  collectVisualReferences,
  fetchAndUploadSolarDataLayerAssets,
  fetchSolarInsights,
  listManualStreetViewReferenceUrls,
  type GoogleSolarDataLayers,
} from '@/lib/openclaw-google'
import {
  buildVisualReferenceCards,
  clampVisualZoom,
  filterExcludedReferences,
  formatGoogleDate,
  getExcludedReferenceUrls,
} from '@/lib/prospect-admin'
import { getProspectVisualCandidate, type Prospect } from '@/lib/prospect'

const MAX_AUTO_SOLAR_CENTER_DRIFT_METERS = 180
const MIN_AUTO_SOLAR_PANEL_COUNT = 80
const MIN_AUTO_SOLAR_AREA_METERS = 750

type AdminSupabase = Awaited<ReturnType<typeof createAdminClient>>

type ProspectVisualReferenceRecord = {
  id: string
  address: string
  visual_preview_url?: string | null
  visual_reference_exclusions?: string[] | null
  solar_reference_enabled?: boolean | null
  solar_reference_lat?: number | null
  solar_reference_lng?: number | null
  solar_reference_zoom?: number | null
  solar_reference_url?: string | null
}

export async function fetchProspectSolarRgbReference({
  supabase,
  id,
  lat,
  lng,
}: {
  supabase: AdminSupabase
  id: string
  lat: number
  lng: number
}) {
  const assets = await fetchAndUploadSolarDataLayerAssets({
    supabase,
    bucket: 'prospects',
    slug: id,
    lat,
    lng,
  })
  const rgb = assets.layers.find((layer) => layer.id === 'rgb')
  if (!rgb?.previewUrl) {
    throw new Error(rgb?.error || 'Google Solar API did not return RGB roof imagery for this target.')
  }

  return {
    url: rgb.previewUrl,
    assets,
  }
}

export async function buildProspectSolarApiLayoutReference({
  supabase,
  id,
  lat,
  lng,
  zoom,
}: {
  supabase: AdminSupabase
  id: string
  lat: number
  lng: number
  zoom?: number
}) {
  try {
    const insights = await fetchSolarInsights(lat, lng)
    if (!insights?.solarPotential) return null

    const solarZoom = clampVisualZoom(zoom)
    const solarRgb = await fetchProspectSolarRgbReference({
      supabase,
      id,
      lat,
      lng,
    })
    await supabase
      .from('prospects')
      .update({
        solar_reference_enabled: true,
        solar_reference_lat: lat,
        solar_reference_lng: lng,
        solar_reference_zoom: solarZoom,
        solar_reference_url: solarRgb.url,
        solar_reference_updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return solarRgb.url
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[pipeline] Solar API layout reference unavailable: ${message}`)
    return null
  }
}

export async function collectProspectVisualReferences({
  supabase,
  prospect,
  lat,
  lng,
}: {
  supabase: AdminSupabase
  prospect: ProspectVisualReferenceRecord
  lat: number
  lng: number
}) {
  const referenceSet = await collectVisualReferences({
    supabase,
    bucket: 'prospects',
    slug: prospect.id,
    lat,
    lng,
    address: prospect.address,
    mapTilesImageUrl: prospect.visual_preview_url || null,
  })
  const manualStreetViewReferenceUrls = await listManualStreetViewReferenceUrls({
    supabase,
    prospectId: prospect.id,
  })
  const excludedUrls = getExcludedReferenceUrls(prospect.visual_reference_exclusions)
  const solarApiLayoutImageUrl = prospect.solar_reference_enabled === false
    ? null
    : prospect.solar_reference_url || await buildProspectSolarApiLayoutReference({
      supabase,
      id: prospect.id,
      lat: prospect.solar_reference_lat ?? lat,
      lng: prospect.solar_reference_lng ?? lng,
      zoom: prospect.solar_reference_zoom ?? undefined,
    })
  const mergedReferenceSet = {
    ...referenceSet,
    solarApiLayoutImageUrl: solarApiLayoutImageUrl || referenceSet.solarApiLayoutImageUrl || null,
    streetViewReferenceUrls: [
      ...manualStreetViewReferenceUrls,
      ...referenceSet.streetViewReferenceUrls,
    ].filter((url, index, urls) => urls.indexOf(url) === index),
  }
  const filteredReferenceSet = filterExcludedReferences(mergedReferenceSet, excludedUrls)

  return {
    filteredReferenceSet,
    excludedUrls,
    manualStreetViewCount: manualStreetViewReferenceUrls.length,
    referenceCards: buildVisualReferenceCards(filteredReferenceSet, manualStreetViewReferenceUrls.length),
  }
}

export async function getProspectSolarCapability({
  supabase,
  id,
  lat,
  lng,
}: {
  supabase: AdminSupabase
  id: string
  lat: number
  lng: number
}) {
  const [insightsResult, dataLayersResult] = await Promise.allSettled([
    fetchSolarInsights(lat, lng),
    fetchAndUploadSolarDataLayerAssets({
      supabase,
      bucket: 'prospects',
      slug: id,
      lat,
      lng,
    }),
  ])
  const insights = insightsResult.status === 'fulfilled' ? insightsResult.value : null
  const dataLayerAssets = dataLayersResult.status === 'fulfilled' ? dataLayersResult.value : null
  const dataLayers = dataLayerAssets?.metadata || null
  const insightsError = insightsResult.status === 'rejected'
    ? insightsResult.reason instanceof Error ? insightsResult.reason.message : String(insightsResult.reason)
    : null
  const dataLayersError = dataLayersResult.status === 'rejected'
    ? dataLayersResult.reason instanceof Error ? dataLayersResult.reason.message : String(dataLayersResult.reason)
    : null

  const roofSegments = (insights?.solarPotential?.roofSegmentStats || []).slice(0, 8).map((segment, index) => ({
    id: index + 1,
    areaSqft: segment.stats?.areaMeters2 ? Math.round(segment.stats.areaMeters2 * 10.7639) : null,
    pitchDegrees: typeof segment.pitchDegrees === 'number' ? Math.round(segment.pitchDegrees * 10) / 10 : null,
    azimuthDegrees: typeof segment.azimuthDegrees === 'number' ? Math.round(segment.azimuthDegrees) : null,
  }))
  const assetById = new Map((dataLayerAssets?.layers || []).map((layer) => [layer.id, layer]))
  const dataLayerCards = buildSolarDataLayerCards(dataLayers, dataLayersError, assetById)

  return {
    success: Boolean(insights || dataLayers),
    error: !insights && !dataLayers
      ? insightsError || dataLayersError || 'Google Solar API returned no roof data for this location.'
      : undefined,
    building: {
      available: Boolean(insights),
      centerLat: insights?.center?.latitude ?? null,
      centerLng: insights?.center?.longitude ?? null,
      roofSegmentCount: insights?.solarPotential?.roofSegmentStats?.length || 0,
      panelCandidateCount: insights?.solarPotential?.solarPanels?.length || 0,
      maxPanelCount: insights?.solarPotential?.maxArrayPanelsCount || 0,
      maxArrayAreaSqft: insights?.solarPotential?.maxArrayAreaMeters2
        ? Math.round(insights.solarPotential.maxArrayAreaMeters2 * 10.7639)
        : null,
      maxSunshineHoursPerYear: insights?.solarPotential?.maxSunshineHoursPerYear
        ? Math.round(insights.solarPotential.maxSunshineHoursPerYear)
        : null,
      unavailableReason: insights ? null : insightsError || 'No buildingInsights result for this roof.',
    },
    roofSegments,
    dataLayers: {
      available: Boolean(dataLayers),
      imageryQuality: dataLayers?.imageryQuality || null,
      imageryDate: formatGoogleDate(dataLayers?.imageryDate),
      imageryProcessedDate: formatGoogleDate(dataLayers?.imageryProcessedDate),
      cards: dataLayerCards,
      unavailableReason: dataLayers ? null : dataLayersError || 'No Solar data layers result for this roof.',
    },
  }
}

export async function resolveAutoVisualCandidate(prospect: Prospect) {
  const existing = getProspectVisualCandidate(prospect)
  if (
    prospect.visual_verified === true &&
    existing?.source === 'saved_visual'
  ) {
    return existing
  }

  if (existing) {
    const solarCandidate = await getSolarRoofCenterCandidate(existing.lat, existing.lng)
    if (solarCandidate) return solarCandidate
  }

  return existing
}

function buildSolarDataLayerCards(
  dataLayers: GoogleSolarDataLayers | null,
  dataLayersError: string | null,
  assetById: Map<string, { previewUrl?: string | null; originalUrl?: string | null }>,
) {
  return [
    {
      id: 'rgb',
      label: 'Solar RGB imagery',
      available: Boolean(dataLayers?.rgbUrl),
      reason: dataLayers?.rgbUrl ? null : dataLayersError || 'Unavailable from Solar data layers for this roof.',
      previewUrl: assetById.get('rgb')?.previewUrl || null,
      originalUrl: assetById.get('rgb')?.originalUrl || null,
    },
    {
      id: 'mask',
      label: 'Roof mask',
      available: Boolean(dataLayers?.maskUrl),
      reason: dataLayers?.maskUrl ? null : dataLayersError || 'Unavailable from Solar data layers for this roof.',
      previewUrl: assetById.get('mask')?.previewUrl || null,
      originalUrl: assetById.get('mask')?.originalUrl || null,
    },
    {
      id: 'dsm',
      label: 'DSM height model',
      available: Boolean(dataLayers?.dsmUrl),
      reason: dataLayers?.dsmUrl ? null : dataLayersError || 'Unavailable from Solar data layers for this roof.',
      previewUrl: assetById.get('dsm')?.previewUrl || null,
      originalUrl: assetById.get('dsm')?.originalUrl || null,
    },
    {
      id: 'annual-flux',
      label: 'Annual sunlight flux',
      available: Boolean(dataLayers?.annualFluxUrl),
      reason: dataLayers?.annualFluxUrl ? null : dataLayersError || 'Unavailable from Solar data layers for this roof.',
      previewUrl: assetById.get('annualFlux')?.previewUrl || null,
      originalUrl: assetById.get('annualFlux')?.originalUrl || null,
    },
    {
      id: 'monthly-flux',
      label: 'Monthly sunlight flux',
      available: Boolean(dataLayers?.monthlyFluxUrl),
      reason: dataLayers?.monthlyFluxUrl ? null : 'Not requested in this lightweight app view to control payload size.',
      previewUrl: null,
      originalUrl: null,
    },
    {
      id: 'hourly-shade',
      label: 'Hourly shade layers',
      available: Boolean(dataLayers?.hourlyShadeUrls?.length),
      reason: dataLayers?.hourlyShadeUrls?.length ? null : 'Not requested in this lightweight app view to control payload size.',
      previewUrl: null,
      originalUrl: null,
    },
  ]
}

async function getSolarRoofCenterCandidate(lat: number, lng: number) {
  const insights = await fetchSolarInsights(lat, lng).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[pipeline] Auto visual target solar lookup failed: ${message}`)
    return null
  })

  const center = insights?.center
  if (typeof center?.latitude !== 'number' || typeof center.longitude !== 'number') return null

  const driftMeters = distanceMeters(lat, lng, center.latitude, center.longitude)
  const panelCount = insights?.solarPotential?.maxArrayPanelsCount || insights?.solarPotential?.solarPanels?.length || 0
  const roofAreaMeters = insights?.solarPotential?.maxArrayAreaMeters2 || 0
  const looksCommercial = panelCount >= MIN_AUTO_SOLAR_PANEL_COUNT || roofAreaMeters >= MIN_AUTO_SOLAR_AREA_METERS

  if (driftMeters > MAX_AUTO_SOLAR_CENTER_DRIFT_METERS || !looksCommercial) {
    console.log('[pipeline] Auto visual target rejected', {
      driftMeters: Math.round(driftMeters),
      panelCount,
      roofAreaMeters: Math.round(roofAreaMeters),
      looksCommercial,
    })
    return null
  }

  return {
    lat: center.latitude,
    lng: center.longitude,
    source: 'google_solar_roof_center' as const,
    reason: `${Math.round(driftMeters)}m drift, ${panelCount} panels, ${Math.round(roofAreaMeters)}m2 roof`,
  }
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earthRadiusMeters = 6371000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(bLat - aLat)
  const deltaLng = toRadians(bLng - aLng)
  const lat1 = toRadians(aLat)
  const lat2 = toRadians(bLat)
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export async function buildProspectSolarModel(lat: number, lng: number) {
  const insights = await fetchSolarInsights(lat, lng)
  return buildSolarModel(insights)
}
