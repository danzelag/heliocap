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
    const {
      business_name,
      contact_name,
      address,
      roof_sqft,
      utility_rate,
      notes,
      roof_image_url,
      render_image_url,
      render_preview_url,
      video_url,
      lat,
      lng,
      building_type,
      job_id,
      prospect_id,
      solar_model,
      filtered,
      reason,
    } = body

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
      return NextResponse.json({ error: 'business_name is required' }, { status: 400 })
    }

    if (!isUsableVideoUrl(video_url)) {
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'running',
        step: 'Waiting for proposal video',
        progressPercent: 92,
      })

      return NextResponse.json({
        success: false,
        pending: true,
        source: 'pending_video',
        reason: 'Proposal video is required before publishing',
      }, { status: 202 })
    }

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      status: 'running',
      step: 'Publishing proposal',
      progressPercent: 95,
    })

    // AI-Powered Estimation if roof_sqft is provided
    let savings = capCommercialSavings(body.estimated_savings)
    let payback = body.estimated_payback

    if (solar_model && typeof solar_model === 'object') {
      const model = solar_model as Record<string, unknown>
      if (savings == null && typeof model.yearlySavings === 'number') savings = capCommercialSavings(model.yearlySavings)
      if (payback == null && typeof model.estimatedPayback === 'number') payback = model.estimatedPayback
    }

    if (roof_sqft && !savings) {
      const estimation = SolarUtils.calculateEstimation(roof_sqft, utility_rate || 0.12)
      savings = estimation.savings
      payback = estimation.payback
    }

    const baseSlug = body.slug ? SolarUtils.generateSlug(String(body.slug)) : SolarUtils.generateSlug(business_name)
    let slug = baseSlug

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const { data: existingLead, error: slugError } = await supabase
        .from('leads')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (slugError) throw slugError
      if (!existingLead) break
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

    const { data, error } = await supabase
      .from('leads')
      .insert([
        {
          business_name,
          contact_name,
          address,
          slug,
          roof_sqft,
          utility_rate: utility_rate || 0.12,
          estimated_savings: savings,
          estimated_payback: payback,
          roof_image_url: finalRoofImageUrl,
          render_image_url: finalRenderImageUrl,
          render_preview_url: finalRenderPreviewUrl,
          video_url: video_url || null,
          lat: lat ?? null,
          lng: lng ?? null,
          building_type: building_type || null,
          notes,
          status: 'published'
        }
      ])
      .select()
      .single()

    if (error) throw error

    if (job_id) {
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://heliocap.vercel.app').replace(/\/$/, '')
      const proposalUrl = `${siteUrl}/proposal/${data.slug}`

      await supabase
        .from('proposal_jobs')
        .update({
          status: 'completed',
          current_step: 'Proposal live',
          progress_percent: 100,
          proposal_url: proposalUrl,
          lead_id: data.id,
        })
        .eq('id', job_id)
      await recordProposalJobEvent(supabase, {
        jobId: job_id,
        businessName: data.business_name,
        status: 'completed',
        step: 'Proposal live',
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
