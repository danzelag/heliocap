import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'
import {
  buildSolarLayoutDebug,
  buildSolarModel,
  buildSolarPanelLayerSvg,
  collectVisualReferences,
  fetchAndUploadSolarDataLayerAssets,
  fetchSolarInsights,
  getSolarRoofFocusCrop,
  listManualStreetViewReferenceUrls,
  selectStaticMapCenter,
  uploadLeadAsset,
} from '@/lib/openclaw-google'
import { buildSolarRgbProposalRender } from '@/lib/proposal-image-compose'
import {
  buildRenderQualityFlags,
  getPresentationRotationDegrees,
  getSolarRgbRasterPlacement,
  getUsableSolarRgbLayer,
  selectProposalRenderSize,
} from '@/lib/proposal-workflow-shared'

/**
 * POST /api/generate-roof-image
 * Fetches satellite imagery + Google Solar geometry for given coordinates,
 * uploads the raw roof image and panel overlay render to Supabase Storage,
 * and returns OpenClaw-ready modeling data.
 *
 * Body: { lat, lng, slug, formattedAddress?, bucket?: 'leads' | 'prospects' }
 * Response: { roof_image_url, render_image_url, render_preview_url, solar_model }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      bucket = 'leads',
      job_id,
      business_name,
      prospect_id,
      prospectId,
      place_id,
      placeId,
      formattedAddress,
      formatted_address,
      address,
      solarApiLayoutImageUrl,
      solar_api_layout_image_url,
    } = body

    const slug = sanitizeN8nString(body.slug)
    const prospectIdentifier = sanitizeN8nString(prospect_id || prospectId)
    const placeIdentifier = sanitizeN8nString(place_id || placeId)
    let targetLat = Number(stripN8nPrefix(body.lat))
    let targetLng = Number(stripN8nPrefix(body.lng))
    let targetAddress = getFirstString(formattedAddress, formatted_address, address)
    let prospectReferenceControls: {
      solarReferenceUrl: string | null
      solarReferenceEnabled: boolean
      excludedReferenceUrls: string[]
    } | null = null

    if (bucket !== 'leads' && bucket !== 'prospects') {
      return NextResponse.json({ error: 'bucket must be leads or prospects' }, { status: 400 })
    }

    if (bucket === 'prospects') {
      const authError = verifyN8nRequest(request)
      if (authError) return authError
    }

    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
    }
    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }

    const supabase = await createAdminClient()
    if (bucket === 'prospects' && prospectIdentifier) {
      const verifiedTarget = await getVerifiedProspectVisualTarget(supabase, prospectIdentifier)
      if (verifiedTarget) {
        targetLat = verifiedTarget.lat
        targetLng = verifiedTarget.lng
        targetAddress = verifiedTarget.address || targetAddress
        prospectReferenceControls = {
          solarReferenceUrl: verifiedTarget.solarReferenceUrl,
          solarReferenceEnabled: verifiedTarget.solarReferenceEnabled,
          excludedReferenceUrls: verifiedTarget.excludedReferenceUrls,
        }
        console.log('[generate-roof-image] Using verified prospect visual target from Supabase', verifiedTarget)
      }
    }

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      status: 'running',
      step: 'Generating roof image',
      progressPercent: 20,
    })

    const solarInsights = await fetchSolarInsights(targetLat, targetLng).catch((error) => {
      console.error('[generate-roof-image] Google Solar fallback:', error)
      return null
    })
    const solarModel = buildSolarModel(solarInsights)
    const mapCenter = selectStaticMapCenter(solarInsights, targetLat, targetLng)
    console.log('[generate-roof-image] Visual target center selected', mapCenter)
    const solarDataLayerAssets = await fetchAndUploadSolarDataLayerAssets({
      supabase,
      bucket,
      slug,
      lat: mapCenter.lat,
      lng: mapCenter.lng,
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[generate-roof-image] Solar data layers unavailable: ${message}`)
      return null
    })
    const solarRgbLayer = getUsableSolarRgbLayer(solarDataLayerAssets?.layers || [])
    if (!solarRgbLayer) {
      return NextResponse.json({
        error: 'Solar API RGB imagery is unavailable for this target. Verify the target coordinates before generating.',
      }, { status: 422 })
    }
    const roofImageUrl = solarRgbLayer.previewUrl
    const roofImageSourceUrl = solarRgbLayer.sourceUrl
    const maskLayer = solarDataLayerAssets?.layers.find((layer) => layer.id === 'mask') || null
    const maskImageUrl = maskLayer?.originalUrl || maskLayer?.previewUrl || null
    const visualReferences = await collectVisualReferences({
      supabase,
      bucket,
      slug,
      lat: mapCenter.lat,
      lng: mapCenter.lng,
      address: targetAddress,
      mapTilesImageUrl: null,
    })
    if (bucket === 'prospects' && prospectIdentifier) {
      const manualStreetViewReferenceUrls = await listManualStreetViewReferenceUrls({
        supabase,
        prospectId: prospectIdentifier,
      })
      if (manualStreetViewReferenceUrls.length) {
        visualReferences.streetViewReferenceUrls = [
          ...manualStreetViewReferenceUrls,
          ...visualReferences.streetViewReferenceUrls,
        ].filter((url, index, urls) => urls.indexOf(url) === index)
        console.log('[generate-roof-image] Manual Street View references attached', {
          count: manualStreetViewReferenceUrls.length,
        })
      }
    }
    const bodySolarReferenceUrl = getFirstString(solarApiLayoutImageUrl, solar_api_layout_image_url)
    const solarReferenceUrl = prospectReferenceControls?.solarReferenceEnabled === false
      ? null
      : bodySolarReferenceUrl || prospectReferenceControls?.solarReferenceUrl || roofImageUrl
    visualReferences.solarApiLayoutImageUrl = solarReferenceUrl
    if (prospectReferenceControls?.excludedReferenceUrls.length) {
      const filtered = filterExcludedReferences(visualReferences, prospectReferenceControls.excludedReferenceUrls)
      visualReferences.mapTilesImageUrl = filtered.mapTilesImageUrl
      visualReferences.aerialViewReferenceUrl = filtered.aerialViewReferenceUrl
      visualReferences.streetViewReferenceUrls = filtered.streetViewReferenceUrls
      visualReferences.cleanedPreviewImageUrl = filtered.cleanedPreviewImageUrl
      visualReferences.solarApiLayoutImageUrl = filtered.solarApiLayoutImageUrl
      await removeExcludedProspectReferenceFiles(supabase, prospectReferenceControls.excludedReferenceUrls)
    }

    const focusCrop = getSolarRoofFocusCrop({
      insights: solarInsights,
      model: solarModel,
      layer: {
        bounds: solarRgbLayer.bounds,
        previewWidth: solarRgbLayer.sourceWidth,
        previewHeight: solarRgbLayer.sourceHeight,
      },
    })
    const renderSize = selectProposalRenderSize(focusCrop, solarRgbLayer)
    const rasterPlacement = getSolarRgbRasterPlacement(solarRgbLayer, renderSize, focusCrop)
    const solarLayoutDebug = buildSolarLayoutDebug(solarInsights, solarModel)
    const presentationRotationDegrees = getPresentationRotationDegrees(solarLayoutDebug)
    const renderQualityFlags = buildRenderQualityFlags({
      panelCount: solarModel.panelCount,
      focusCrop,
      layer: solarRgbLayer,
      rotationDegrees: presentationRotationDegrees,
      hasMask: Boolean(maskImageUrl),
    })
    const panelLayerSvg = buildSolarPanelLayerSvg({
      insights: solarInsights,
      model: solarModel,
      width: renderSize.width,
      height: renderSize.height,
      rasterPlacement,
    })

    const renderImageUrl = await uploadLeadAsset({
      supabase,
      bucket,
      slug,
      fileName: 'solar-panel-layer.svg',
      body: panelLayerSvg,
      contentType: 'image/svg+xml',
    })

    const renderPreviewBuffer = await buildSolarRgbProposalRender({
      roofImageUrl: roofImageSourceUrl,
      panelLayerSvg,
      outputWidth: renderSize.width,
      outputHeight: renderSize.height,
      focusCrop,
      maskImageUrl,
      rotationDegrees: presentationRotationDegrees,
    })
    const renderPreviewUrl = await uploadLeadAsset({
      supabase,
      bucket,
      slug,
      fileName: 'render_preview.webp',
      body: renderPreviewBuffer,
      contentType: 'image/webp',
    })
    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      status: 'running',
      step: 'Roof image complete · running solar model',
      progressPercent: 45,
    })

    if (bucket === 'prospects') {
      const fallbackProspectIdentifier = prospectIdentifier || (isUuid(slug) ? slug : null)
      const update = {
        panel_count: solarModel.panelCount,
        system_kw: solarModel.systemSizeKw,
        yearly_kwh: solarModel.yearlyKwh,
        annual_savings: solarModel.yearlySavings,
        system_cost: solarModel.systemCost,
        federal_itc: solarModel.federalItc,
        payback_years: solarModel.estimatedPayback,
        satellite_url: roofImageUrl,
        render_url: renderImageUrl,
        render_preview_url: renderPreviewUrl,
        solar_quality: solarModel.quality,
        pipeline_stage: 'solar_fetched',
      }

      if (fallbackProspectIdentifier) {
        const { error: updateError } = await supabase.from('prospects').update(update).eq('id', fallbackProspectIdentifier)
        if (updateError) console.error('[generate-roof-image] prospect update:', updateError.message)
      } else if (placeIdentifier) {
        const { error: updateError } = await supabase.from('prospects').update(update).eq('place_id', placeIdentifier)
        if (updateError) console.error('[generate-roof-image] prospect update:', updateError.message)
      }
    }

    if (job_id) {
      await mergeProposalJobReceipt(supabase, job_id, {
        visual_references: visualReferences,
        reference_set: visualReferences,
        mapTilesImageUrl: visualReferences.mapTilesImageUrl,
        aerialViewReferenceUrl: visualReferences.aerialViewReferenceUrl,
        streetViewReferenceUrls: visualReferences.streetViewReferenceUrls,
        solarApiLayoutImageUrl: visualReferences.solarApiLayoutImageUrl,
        visual_target: mapCenter,
        solar_layout_debug: solarLayoutDebug,
        solar_data_layers: solarDataLayerAssets,
        render_aspect: renderSize.aspect,
        render_size: renderSize,
        presentationRotationDegrees,
        mask_source: maskImageUrl ? 'google_solar_mask' : 'none',
        render_quality: renderQualityFlags.length ? 'needs_review' : 'awaiting_review',
        render_quality_flags: renderQualityFlags,
        // renderPreviewUrl has matte black Solar API panels composited onto Solar RGB imagery.
        // This is the customer-facing proposal image; video generation is not required.
        solarPanelRenderUrl: renderPreviewUrl,
        roof_focus_crop: focusCrop,
      })
    }

    return NextResponse.json({
      roof_image_url: roofImageUrl,
      render_image_url: renderImageUrl,
      render_preview_url: renderPreviewUrl,
      mapTilesImageUrl: visualReferences.mapTilesImageUrl,
      aerialViewReferenceUrl: visualReferences.aerialViewReferenceUrl,
      streetViewReferenceUrls: visualReferences.streetViewReferenceUrls,
      solarApiLayoutImageUrl: visualReferences.solarApiLayoutImageUrl,
      reference_set: visualReferences,
      visual_target: mapCenter,
      solar_layout_debug: solarLayoutDebug,
      solar_data_layers: solarDataLayerAssets,
      render_aspect: renderSize.aspect,
      render_size: renderSize,
      presentationRotationDegrees,
      mask_source: maskImageUrl ? 'google_solar_mask' : 'none',
      render_quality: renderQualityFlags.length ? 'needs_review' : 'awaiting_review',
      render_quality_flags: renderQualityFlags,
      roof_focus_crop: focusCrop,
      solar_model: solarModel,
      solar_insights_available: Boolean(solarInsights),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-roof-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function getVerifiedProspectVisualTarget(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  prospectId: string,
) {
  const { data, error } = await supabase
    .from('prospects')
    .select('address, visual_lat, visual_lng, visual_zoom, visual_verified, solar_reference_url, solar_reference_enabled, visual_reference_exclusions')
    .eq('id', prospectId)
    .maybeSingle()

  if (error) {
    console.error('[generate-roof-image] verified visual target lookup:', error.message)
    return null
  }

  if (
    data?.visual_verified === true &&
    typeof data.visual_lat === 'number' &&
    typeof data.visual_lng === 'number'
  ) {
    return {
      lat: data.visual_lat,
      lng: data.visual_lng,
      zoom: data.visual_zoom,
      address: typeof data.address === 'string' ? data.address : null,
      solarReferenceUrl: typeof data.solar_reference_url === 'string' ? data.solar_reference_url : null,
      solarReferenceEnabled: data.solar_reference_enabled !== false,
      excludedReferenceUrls: getExcludedReferenceUrls(data.visual_reference_exclusions),
    }
  }

  return null
}

function getExcludedReferenceUrls(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((url): url is string => typeof url === 'string' && url.startsWith('http'))
}

function filterExcludedReferences<T extends {
  mapTilesImageUrl: string | null
  aerialViewReferenceUrl: string | null
  streetViewReferenceUrls: string[]
  cleanedPreviewImageUrl?: string | null
  solarApiLayoutImageUrl?: string | null
}>(referenceSet: T, excludedUrls: string[]): T {
  if (!excludedUrls.length) return referenceSet
  const excluded = new Set(excludedUrls)

  return {
    ...referenceSet,
    mapTilesImageUrl: referenceSet.mapTilesImageUrl && !excluded.has(referenceSet.mapTilesImageUrl)
      ? referenceSet.mapTilesImageUrl
      : null,
    aerialViewReferenceUrl: referenceSet.aerialViewReferenceUrl && !excluded.has(referenceSet.aerialViewReferenceUrl)
      ? referenceSet.aerialViewReferenceUrl
      : null,
    cleanedPreviewImageUrl: referenceSet.cleanedPreviewImageUrl && !excluded.has(referenceSet.cleanedPreviewImageUrl)
      ? referenceSet.cleanedPreviewImageUrl
      : null,
    solarApiLayoutImageUrl: referenceSet.solarApiLayoutImageUrl && !excluded.has(referenceSet.solarApiLayoutImageUrl)
      ? referenceSet.solarApiLayoutImageUrl
      : null,
    streetViewReferenceUrls: referenceSet.streetViewReferenceUrls.filter((url) => !excluded.has(url)),
  }
}

function getProspectStoragePathFromPublicUrl(url: string) {
  try {
    const parsed = new URL(url)
    const marker = '/storage/v1/object/public/prospects/'
    const index = parsed.pathname.indexOf(marker)
    if (index === -1) return null
    return decodeURIComponent(parsed.pathname.slice(index + marker.length))
  } catch {
    return null
  }
}

async function removeExcludedProspectReferenceFiles(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  excludedUrls: string[],
) {
  const paths = excludedUrls
    .map(getProspectStoragePathFromPublicUrl)
    .filter((path): path is string => Boolean(path))

  if (!paths.length) return
  const { error } = await supabase.storage.from('prospects').remove(paths)
  if (error) console.error(`[generate-roof-image] Failed to remove excluded references: ${error.message}`)
}

function stripN8nPrefix(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/^=+/, '') : value
}

function sanitizeN8nString(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/^=+/, '') : ''
}

function isUuid(value: unknown) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function getFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return sanitizeN8nString(value)
  }

  return null
}

async function mergeProposalJobReceipt(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  jobId: string,
  metadata: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from('proposal_jobs')
    .select('receipt')
    .eq('id', jobId)
    .maybeSingle()

  if (error) {
    console.error('[generate-roof-image] receipt lookup:', error.message)
    return
  }

  const current = data?.receipt && typeof data.receipt === 'object'
    ? data.receipt as Record<string, unknown>
    : {}

  const { error: updateError } = await supabase
    .from('proposal_jobs')
    .update({
      receipt: {
        ...current,
        ...metadata,
        updated_at: new Date().toISOString(),
      },
    })
    .eq('id', jobId)

  if (updateError) {
    console.error('[generate-roof-image] receipt update:', updateError.message)
  }
}
