import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'
import { generatePremiumSolarRender } from '@/lib/gemini-solar-render'

const PROPOSALS_BUCKET = 'proposals'
const PROPOSAL_IMAGE_TIMEOUT_MS = 45_000

type GenerateProposalImageBody = {
  roof_image_url?: string
  render_image_url?: string
  business_name?: string
  address?: string
  slug?: string
  lat?: number
  lng?: number
  panel_count?: number
  system_kw?: number
  solar_model?: Record<string, unknown> | null
  job_id?: string
  filtered?: boolean
  reason?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateProposalImageBody
    const { roof_image_url, render_image_url, business_name, address, job_id, filtered, reason } = body

    const supabase = await createAdminClient()

    if (filtered) {
      const message = reason || 'No valid roof found for this prospect'
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'failed',
        step: message,
        progressPercent: 100,
        errorMessage: message,
      })
      return NextResponse.json({ skipped: true, reason: message })
    }

    if (!roof_image_url) {
      const message = 'No roof image available — proposal cannot be rendered'
      if (job_id) {
        await updateProposalJobProgress(supabase, {
          jobId: job_id,
          businessName: business_name,
          status: 'failed',
          step: message,
          progressPercent: 100,
          errorMessage: message,
        })
      }
      return NextResponse.json({ error: message }, { status: 400 })
    }

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      step: 'Generating proposal image',
      status: 'running',
      progressPercent: 70,
    })

    const slug = body.slug || SolarUtils.generateSlug(business_name || address || crypto.randomUUID())

    try {
      console.log(`[generate-proposal-image] Calling Gemini for premium solar render: ${slug}`)
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'running',
        step: 'Generating proposal image',
        progressPercent: 76,
      })

      const aiRender = await generatePremiumSolarRender({
        roofImageUrl: roof_image_url,
        renderImageUrl: render_image_url,
        timeoutMs: PROPOSAL_IMAGE_TIMEOUT_MS,
      })
      
      const filePath = `${slug}/preview.webp`
      const { error } = await supabase.storage
        .from(PROPOSALS_BUCKET)
        .upload(filePath, aiRender.buffer, {
          contentType: aiRender.mimeType,
          upsert: true,
        })

      if (error) throw error

      const { data } = supabase.storage.from(PROPOSALS_BUCKET).getPublicUrl(filePath)
      
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'running',
        step: 'Proposal image complete',
        progressPercent: 85,
      })

      console.log('[generate-proposal-image] Result: ai_generated')
      return NextResponse.json({
        render_preview_url: data.publicUrl,
        source: 'ai_generated',
      })
    } catch (error) {
      console.error('[generate-proposal-image] Gemini render failed, falling back to roof image:', error)
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'running',
        step: 'AI render unavailable, using satellite roof image',
        progressPercent: 85,
      })

      return NextResponse.json({
        render_preview_url: roof_image_url,
        source: 'fallback_roof_image',
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-proposal-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
