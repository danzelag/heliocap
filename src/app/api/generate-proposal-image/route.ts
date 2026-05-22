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
  mapTilesImageUrl?: string
  map_tiles_image_url?: string
  aerialViewReferenceUrl?: string | null
  aerial_view_reference_url?: string | null
  streetViewReferenceUrls?: string[]
  street_view_reference_urls?: string[]
  solarApiLayoutImageUrl?: string
  solar_api_layout_image_url?: string
  reference_set?: Record<string, unknown> | null
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
    const { roof_image_url, business_name, address, job_id, filtered, reason } = body

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
        renderImageUrl: null,
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
      const referenceSet = buildReferenceSet(body, {
        mapTilesImageUrl: body.mapTilesImageUrl || body.map_tiles_image_url || roof_image_url,
        cleanedPreviewImageUrl: data.publicUrl,
      })
      if (job_id) {
        await mergeProposalJobReceipt(supabase, job_id, {
          visual_references: referenceSet,
          reference_set: referenceSet,
          cleanedPreviewImageUrl: data.publicUrl,
        })
      }
      
      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'completed',
        step: 'Proposal image complete',
        progressPercent: 100,
      })

      console.log('[generate-proposal-image] Result: ai_generated')
      return NextResponse.json({
        render_preview_url: data.publicUrl,
        cleanedPreviewImageUrl: data.publicUrl,
        reference_set: referenceSet,
        source: 'ai_generated',
      })
    } catch (error) {
      console.error('[generate-proposal-image] Gemini render failed, falling back to roof image:', error)
      const fallbackReferenceSet = buildReferenceSet(body, {
        mapTilesImageUrl: body.mapTilesImageUrl || body.map_tiles_image_url || roof_image_url,
        cleanedPreviewImageUrl: roof_image_url,
      })
      if (job_id) {
        await mergeProposalJobReceipt(supabase, job_id, {
          visual_references: fallbackReferenceSet,
          reference_set: fallbackReferenceSet,
          cleanedPreviewImageUrl: roof_image_url,
        })
      }

      await updateProposalJobProgress(supabase, {
        jobId: job_id,
        businessName: business_name,
        status: 'completed',
        step: 'Image unavailable — using satellite roof image',
        progressPercent: 100,
      })

      return NextResponse.json({
        render_preview_url: roof_image_url,
        cleanedPreviewImageUrl: roof_image_url,
        reference_set: fallbackReferenceSet,
        source: 'fallback_roof_image',
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-proposal-image]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function buildReferenceSet(
  body: GenerateProposalImageBody,
  {
    mapTilesImageUrl,
    cleanedPreviewImageUrl,
  }: {
    mapTilesImageUrl?: string | null
    cleanedPreviewImageUrl?: string | null
  },
) {
  const existing = body.reference_set && typeof body.reference_set === 'object' ? body.reference_set : {}
  const streetViewReferenceUrls = getStringArray(
    body.streetViewReferenceUrls ||
    body.street_view_reference_urls ||
    existing.streetViewReferenceUrls,
  )

  return {
    mapTilesImageUrl: getString(mapTilesImageUrl) || getString(existing.mapTilesImageUrl) || null,
    aerialViewReferenceUrl:
      getString(body.aerialViewReferenceUrl) ||
      getString(body.aerial_view_reference_url) ||
      getString(existing.aerialViewReferenceUrl) ||
      null,
    streetViewReferenceUrls,
    solarApiLayoutImageUrl:
      getString(body.solarApiLayoutImageUrl) ||
      getString(body.solar_api_layout_image_url) ||
      getString(existing.solarApiLayoutImageUrl) ||
      null,
    cleanedPreviewImageUrl: getString(cleanedPreviewImageUrl) || getString(existing.cleanedPreviewImageUrl) || null,
  }
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
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
    console.error('[generate-proposal-image] receipt lookup:', error.message)
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
    console.error('[generate-proposal-image] receipt update:', updateError.message)
  }
}
