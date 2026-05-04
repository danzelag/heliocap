import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { SolarUtils } from '@/lib/solar-utils'
import {
  buildRasterRenderPreview,
  buildSolarModel,
  buildSolarOverlaySvg,
  fetchSolarInsights,
  fetchStaticSatelliteImage,
  selectStaticMapZoom,
  uploadLeadAsset,
} from '@/lib/openclaw-google'

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
    } = body

    if (!business_name) {
      return NextResponse.json({ error: 'business_name is required' }, { status: 400 })
    }

    // AI-Powered Estimation if roof_sqft is provided
    let savings = body.estimated_savings
    let payback = body.estimated_payback

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

    if (!finalRoofImageUrl && !finalRenderImageUrl && lat != null && lng != null) {
      const solarInsights = await fetchSolarInsights(Number(lat), Number(lng)).catch((error) => {
        console.error('[api/leads] Google Solar fallback:', error)
        return null
      })
      const solarModel = buildSolarModel(solarInsights)
      const mapZoom = selectStaticMapZoom(solarModel)
      const imageBuffer = await fetchStaticSatelliteImage(Number(lat), Number(lng), mapZoom)

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
        lat: Number(lat),
        lng: Number(lng),
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

      savings = savings || solarModel.yearlySavings
      payback = payback || solarModel.estimatedPayback
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
      url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/proposal/${data.slug}` 
    })

  } catch (error: any) {
    console.error('Automation Hook Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
