import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { generatePremiumSolarRender, type PremiumSolarRenderSource } from '@/lib/gemini-solar-render'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { SolarUtils } from '@/lib/solar-utils'
import { recordProposalJobEvent, updateProposalJobProgress } from '@/lib/proposal-job-events'
import {
  buildRasterRenderPreview,
  buildSolarModel,
  buildSolarOverlaySvg,
  fetchSolarInsights,
  fetchStaticSatelliteImage,
  selectStaticMapCenter,
  selectStaticMapZoom,
  uploadLeadAsset,
} from '@/lib/openclaw-google'

type RenderSource = PremiumSolarRenderSource | 'provided_preview' | 'technical_preview' | 'none'

type ProposalJobLookup = {
  id: string
  business_name: string | null
  address: string | null
  slug: string | null
  lead_id: string | null
  receipt: Record<string, unknown> | null
}

type ProspectLookup = {
  id: string
  address: string | null
  business_name: string | null
  owner_name: string | null
  sqft: number | null
  annual_savings: number | null
  payback_years: number | null
  satellite_url: string | null
  render_url: string | null
  render_preview_url: string | null
  lat: number | null
  lng: number | null
  use_code: string | null
}

/**
 * Automation Hook for external AIs like OpenClaw.
 * POST /api/leads
 */
export async function POST(request: Request) {
  try {
    const authError = verifyN8nRequest(request)
    if (authError) return authError

    const supabase = await createAdminClient()
    const body = await request.json()
    const requestedSlug = getString(body.slug)
    const requestedVideoUrl = getString(body.video_url ?? body.videoUrl)
    const requestedJobId = getString(body.job_id ?? body.jobId)
    const requestedProspectId = getString(body.prospect_id ?? body.prospectId)
    const filtered = body.filtered
    const reason = body.reason

    const job = await findProposalJob({
      supabase,
      jobId: requestedJobId,
      slug: requestedSlug,
    })
    const receiptProspectId = getString(job?.receipt?.prospect_id ?? job?.receipt?.prospectId)
    const prospect = await findProspect({
      supabase,
      prospectId: requestedProspectId || receiptProspectId,
      address: getString(body.address) || job?.address || undefined,
    })

    const job_id = requestedJobId || job?.id
    const prospect_id = requestedProspectId || prospect?.id || receiptProspectId
    const business_name =
      getString(body.business_name) ||
      prospect?.business_name ||
      job?.business_name ||
      titleFromSlug(requestedSlug)
    const contact_name = getString(body.contact_name) || prospect?.owner_name || null
    const address = getString(body.address) || prospect?.address || job?.address || null
    const roof_sqft = getNumber(body.roof_sqft) ?? prospect?.sqft ?? null
    const utility_rate = getNumber(body.utility_rate) ?? 0.12
    const notes = getString(body.notes) || null
    const roof_image_url = getString(body.roof_image_url) || prospect?.satellite_url || null
    const render_image_url = getString(body.render_image_url) || prospect?.render_url || null
    const render_preview_url =
      getString(body.render_preview_url) ||
      prospect?.render_preview_url ||
      prospect?.render_url ||
      prospect?.satellite_url ||
      null
    const video_url = requestedVideoUrl || null
    const lat = getNumber(body.lat) ?? prospect?.lat ?? null
    const lng = getNumber(body.lng) ?? prospect?.lng ?? null
    const building_type = getString(body.building_type) || prospect?.use_code || null
    const solar_model = body.solar_model

    if (filtered) {
      const message = (typeof reason === 'string' && reason) || 'No valid roof found'
      if (job_id) {
        await updateProposalJobProgress(supabase, {
          jobId: job_id,
          businessName: business_name || 'Filtered prospect',
          status: 'failed',
          step: message,
          progressPercent: 100,
          errorMessage: message,
        })
      }
      return NextResponse.json({ skipped: true, reason: message }, { status: 200 })
    }

    if (!business_name) {
      return NextResponse.json({
        error: 'business_name is required unless slug matches a build queue item or prospect',
      }, { status: 400 })
    }

    if (requestedVideoUrl && !isUsableVideoUrl(video_url)) {
      return NextResponse.json({
        error: 'video_url must be an absolute http(s) URL when provided',
      }, { status: 400 })
    }

    if (!isUsableVideoUrl(video_url)) {
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'running',
        step: 'Publishing still-image proposal',
        progressPercent: 92,
      })
    }

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      status: 'running',
      step: 'Publishing proposal',
      progressPercent: 95,
    })

    // AI-Powered Estimation if roof_sqft is provided
    let savings = capCommercialSavings(body.estimated_savings ?? prospect?.annual_savings)
    let payback = getNumber(body.estimated_payback) ?? prospect?.payback_years ?? null

    if (solar_model && typeof solar_model === 'object') {
      const model = solar_model as Record<string, unknown>
      if (savings == null && typeof model.yearlySavings === 'number') savings = capCommercialSavings(model.yearlySavings)
      if (payback == null && typeof model.estimatedPayback === 'number') payback = model.estimatedPayback
    }

    if (roof_sqft && !savings) {
      const estimation = SolarUtils.calculateEstimation(roof_sqft, utility_rate)
      savings = estimation.savings
      payback = estimation.payback
    }

    const baseSlug = requestedSlug ? SolarUtils.generateSlug(requestedSlug) : SolarUtils.generateSlug(business_name)
    let slug = baseSlug
    let existingLeadId: string | null = null

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const { data: existingLead, error: slugError } = await supabase
        .from('leads')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (slugError) throw slugError
      if (!existingLead) break
      if (requestedSlug && slug === baseSlug) {
        existingLeadId = existingLead.id
        break
      }
      slug = `${baseSlug}-${attempt + 1}`
    }

    let finalRoofImageUrl = roof_image_url || null
    let finalRenderImageUrl = render_image_url || roof_image_url || null
    let finalRenderPreviewUrl = render_preview_url || null
    let renderSource: RenderSource = finalRenderPreviewUrl ? 'provided_preview' : 'none'

    if (!finalRoofImageUrl && !finalRenderImageUrl && lat != null && lng != null) {
      const solarInsights = await fetchSolarInsights(Number(lat), Number(lng)).catch((error) => {
        console.error('[api/leads] Google Solar fallback:', error)
        return null
      })
      const solarModel = buildSolarModel(solarInsights)
      const mapZoom = selectStaticMapZoom(solarModel)
      const mapCenter = selectStaticMapCenter(solarInsights, Number(lat), Number(lng))
      const imageBuffer = await fetchStaticSatelliteImage(mapCenter.lat, mapCenter.lng, mapZoom)

      finalRoofImageUrl = await uploadLeadAsset({
        supabase,
        bucket: 'leads',
        slug,
        fileName: 'roof.png',
        body: imageBuffer,
        contentType: 'image/png',
      })

      const satelliteBase64 = `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`
      const overlaySvg = buildSolarOverlaySvg({
        satelliteUrl: satelliteBase64,
        insights: solarInsights,
        lat: mapCenter.lat,
        lng: mapCenter.lng,
        model: solarModel,
        zoom: mapZoom,
      })

      finalRenderImageUrl = await uploadLeadAsset({
        supabase,
        bucket: 'leads',
        slug,
        fileName: 'render.svg',
        body: overlaySvg,
        contentType: 'image/svg+xml',
      })

      const renderPreviewBuffer = await buildRasterRenderPreview(overlaySvg)
      finalRenderPreviewUrl = await uploadLeadAsset({
        supabase,
        bucket: 'leads',
        slug,
        fileName: 'render_preview.webp',
        body: renderPreviewBuffer,
        contentType: 'image/webp',
      })
      renderSource = 'technical_preview'

      savings = savings || capCommercialSavings(solarModel.yearlySavings)
      payback = payback || solarModel.estimatedPayback
    }

    const premiumRoofImageUrl = finalRoofImageUrl
    if (premiumRoofImageUrl && shouldAttemptPremiumRender({
      roofImageUrl: premiumRoofImageUrl,
      renderImageUrl: finalRenderImageUrl,
      renderPreviewUrl: finalRenderPreviewUrl,
    })) {
      try {
        await updateProposalJobProgress(supabase, {
          jobId: job_id,
          businessName: business_name,
          status: 'running',
          step: 'Generating premium proposal image',
          progressPercent: 82,
        })

        const premiumRender = await generatePremiumSolarRender({
          roofImageUrl: premiumRoofImageUrl,
          renderImageUrl: finalRenderImageUrl,
          timeoutMs: getLeadsGeminiRenderTimeoutMs(),
        })

        finalRenderPreviewUrl = await uploadLeadAsset({
          supabase,
          bucket: 'leads',
          slug,
          fileName: 'premium_render.webp',
          body: premiumRender.buffer,
          contentType: premiumRender.mimeType,
        })
        renderSource = 'ai_generated'
      } catch (error) {
        console.error('[api/leads] Gemini premium render failed, publishing with roof image fallback:', error)
        finalRenderPreviewUrl = premiumRoofImageUrl
        renderSource = 'fallback_roof_image'

        await updateProposalJobProgress(supabase, {
          jobId: job_id,
          businessName: business_name,
          status: 'running',
          step: 'AI render unavailable, publishing with roof image',
          progressPercent: 90,
        })
      }
    } else if (!finalRenderPreviewUrl && finalRoofImageUrl) {
      finalRenderPreviewUrl = finalRoofImageUrl
      renderSource = 'fallback_roof_image'
    }

    const leadPayload = {
      business_name,
      contact_name,
      address,
      slug,
      roof_sqft,
      utility_rate,
      estimated_savings: savings,
      estimated_payback: payback,
      roof_image_url: finalRoofImageUrl,
      render_image_url: finalRenderImageUrl,
      render_preview_url: finalRenderPreviewUrl,
      video_url,
      lat,
      lng,
      building_type,
      notes,
      status: 'published'
    }

    const leadMutation = existingLeadId
      ? supabase
        .from('leads')
        .update(leadPayload)
        .eq('id', existingLeadId)
        .select()
        .single()
      : supabase
        .from('leads')
        .insert([leadPayload])
        .select()
        .single()

    const { data, error } = await leadMutation

    if (error) throw error

    if (job_id) {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliocap.vercel.app').replace(/\/$/, '')
      const proposalUrl = `${siteUrl}/proposal/${data.slug}`
      const updatedReceipt = mergeMetadata(job?.receipt || null, {
        build_status: 'proposal_published',
        build_status_label: 'Proposal Ready',
        video_complete: isUsableVideoUrl(video_url),
        video_optional: !isUsableVideoUrl(video_url),
        video_url,
        lead_id: data.id,
        proposal_url: proposalUrl,
        updated_by: 'api/leads',
        updated_at: new Date().toISOString(),
      })

      await supabase
        .from('proposal_jobs')
        .update({
          status: 'completed',
          current_step: 'Proposal Ready',
          progress_percent: 100,
          proposal_url: proposalUrl,
          lead_id: data.id,
          receipt: updatedReceipt,
        })
        .eq('id', job_id)
      await recordProposalJobEvent(supabase, {
        jobId: job_id,
        businessName: data.business_name,
        status: 'completed',
        step: 'Proposal Ready',
        progressPercent: 100,
        proposalUrl,
      })
    }

    if (prospect_id) {
      await supabase
        .from('prospects')
        .update({
          lead_id: data.id,
          microsite_slug: data.slug,
          video_url,
          pipeline_stage: 'microsite_live',
        })
        .eq('id', prospect_id)
    }

    return NextResponse.json({ 
      success: true, 
      lead_id: data.id,
      slug: data.slug,
      render_preview_url: data.render_preview_url,
      source: renderSource,
      video_url: data.video_url,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/proposal/${data.slug}` 
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Automation Hook Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function capCommercialSavings(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(Math.max(Math.round(value), 0), 375000)
}

async function findProposalJob({
  supabase,
  jobId,
  slug,
}: {
  supabase: Awaited<ReturnType<typeof createAdminClient>>
  jobId?: string
  slug?: string
}) {
  if (!jobId && !slug) return null

  let query = supabase
    .from('proposal_jobs')
    .select('id, business_name, address, slug, lead_id, receipt')

  query = jobId ? query.eq('id', jobId) : query.eq('slug', slug)

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as ProposalJobLookup | null) || null
}

async function findProspect({
  supabase,
  prospectId,
  address,
}: {
  supabase: Awaited<ReturnType<typeof createAdminClient>>
  prospectId?: string
  address?: string
}) {
  if (!prospectId && !address) return null

  let query = supabase
    .from('prospects')
    .select('id, address, business_name, owner_name, sqft, annual_savings, payback_years, satellite_url, render_url, render_preview_url, lat, lng, use_code')

  query = prospectId ? query.eq('id', prospectId) : query.eq('address', address)

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as ProspectLookup | null) || null
}

function mergeMetadata(
  current: Record<string, unknown> | null,
  next: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries({
      ...(current || {}),
      ...next,
    }).filter(([, value]) => value !== undefined),
  )
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function titleFromSlug(value?: string) {
  if (!value) return null

  return value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function shouldAttemptPremiumRender({
  roofImageUrl,
  renderImageUrl,
  renderPreviewUrl,
}: {
  roofImageUrl: string | null
  renderImageUrl: string | null
  renderPreviewUrl: string | null
}) {
  if (!roofImageUrl) return false
  if (!renderPreviewUrl) return true

  return isTechnicalPreviewUrl(renderPreviewUrl, roofImageUrl, renderImageUrl)
}

function isTechnicalPreviewUrl(previewUrl: string, roofImageUrl: string, renderImageUrl: string | null) {
  if (previewUrl === roofImageUrl || previewUrl === renderImageUrl) return true

  try {
    const pathname = new URL(previewUrl).pathname.toLowerCase()
    return pathname.includes('render_preview') || pathname.endsWith('/render.svg')
  } catch {
    return previewUrl.includes('render_preview') || previewUrl.endsWith('/render.svg')
  }
}

function getLeadsGeminiRenderTimeoutMs() {
  const configuredValue = Number(process.env.GEMINI_LEADS_TIMEOUT_MS)

  if (Number.isFinite(configuredValue) && configuredValue >= 1000) {
    return configuredValue
  }

  return 18_000
}

function isUsableVideoUrl(value: unknown) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}
