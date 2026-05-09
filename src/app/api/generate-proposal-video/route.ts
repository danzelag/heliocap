import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { submitVeoRender } from '@/lib/veo-render'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'

type GenerateProposalVideoBody = {
  slug: string
  render_preview_url: string
  job_id?: string
  business_name?: string
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  let jobId: string | undefined
  let businessName: string | undefined

  try {
    const body = (await request.json()) as GenerateProposalVideoBody
    const { slug, render_preview_url, job_id, business_name } = body
    jobId = job_id
    businessName = business_name

    if (!slug || !render_preview_url) {
      return NextResponse.json({ error: 'slug and render_preview_url are required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      status: 'running',
      step: 'Submitting Veo render',
      progressPercent: 88,
    })

    const seedRes = await fetch(render_preview_url, { cache: 'no-store' })
    if (!seedRes.ok) {
      throw new Error(`Failed to fetch seed image: ${seedRes.status}`)
    }
    const rawMime = seedRes.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/webp'
    const seedBuffer = Buffer.from(await seedRes.arrayBuffer())

    const { operationName } = await submitVeoRender({ seedBuffer, seedMimeType: rawMime })

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      status: 'running',
      step: 'Veo render submitted — polling for completion',
      progressPercent: 90,
    })

    return NextResponse.json({ operation_name: operationName })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-proposal-video]', message)

    if (jobId) {
      try {
        const supabase = await createAdminClient()
        await updateProposalJobProgress(supabase, {
          jobId,
          businessName,
          status: 'failed',
          step: 'Veo render failed',
          progressPercent: 88,
          errorMessage: message,
        })
      } catch (progressError) {
        console.error('[generate-proposal-video/progress]', progressError)
      }
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
