import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'
import {
  buildRasterRenderPreview,
  buildSolarModel,
  buildSolarOverlaySvg,
  collectVisualReferences,
  fetchSolarInsights,
  fetchStaticSatelliteImage,
  listManualStreetViewReferenceUrls,
  selectStaticMapCenter,
  selectStaticMapZoom,
  uploadLeadAsset,
} from '@/lib/openclaw-google'

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
      visual_zoom,
      map_zoom,
      zoom,
    } = body

    const slug = sanitizeN8nString(body.slug)
    const prospectIdentifier = sanitizeN8nString(prospect_id || prospectId)
    const placeIdentifier = sanitizeN8nString(place_id || placeId)
    let targetLat = Number(stripN8nPrefix(body.lat))
    let targetLng = Number(stripN8nPrefix(body.lng))
    let requestedZoom: unknown = visual_zoom ?? map_zoom ?? zoom
    let targetAddress = getFirstString(formattedAddress, formatted_address, address)

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
        requestedZoom = verifiedTarget.zoom ?? requestedZoom
        targetAddress = verifiedTarget.address || targetAddress
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
    const mapZoom = clampMapZoom(requestedZoom) || selectStaticMapZoom(solarModel)
    const mapCenter = selectStaticMapCenter(solarInsights, targetLat, targetLng)
    console.log('[generate-roof-image] Visual target center selected', mapCenter)
    const imageBuffer = await fetchStaticSatelliteImage(mapCenter.lat, mapCenter.lng, mapZoom)

    const roofImageUrl = await uploadLeadAsset({
      supabase,
      bucket,
      slug,
      fileName: 'roof.png',
      body: imageBuffer,
      contentType: 'image/png',
    })
    const visualReferences = await collectVisualReferences({
      supabase,
      bucket,
      slug,
      lat: mapCenter.lat,
      lng: mapCenter.lng,
      address: targetAddress,
      mapTilesImageUrl: roofImageUrl,
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

    const satelliteBase64 = `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`
    const overlaySvg = buildSolarOverlaySvg({
      satelliteUrl: satelliteBase64,
      insights: solarInsights,
      lat: mapCenter.lat,
      lng: mapCenter.lng,
      model: solarModel,
      zoom: mapZoom,
    })

    const renderImageUrl = await uploadLeadAsset({
      supabase,
      bucket,
      slug,
      fileName: 'render.svg',
      body: overlaySvg,
      contentType: 'image/svg+xml',
    })

    const renderPreviewBuffer = await buildRasterRenderPreview(overlaySvg)
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
        visual_target: mapCenter,
      })
    }

    return NextResponse.json({
      roof_image_url: roofImageUrl,
      render_image_url: renderImageUrl,
      render_preview_url: renderPreviewUrl,
      mapTilesImageUrl: visualReferences.mapTilesImageUrl,
      aerialViewReferenceUrl: visualReferences.aerialViewReferenceUrl,
      streetViewReferenceUrls: visualReferences.streetViewReferenceUrls,
      reference_set: visualReferences,
      visual_target: mapCenter,
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
    .select('address, visual_lat, visual_lng, visual_zoom, visual_verified')
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
    }
  }

  return null
}

function stripN8nPrefix(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/^=+/, '') : value
}

function sanitizeN8nString(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/^=+/, '') : ''
}

function clampMapZoom(value: unknown) {
  const zoom = Number(value)
  if (!Number.isFinite(zoom)) return null
  return Math.min(Math.max(Math.round(zoom), 16), 21)
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
