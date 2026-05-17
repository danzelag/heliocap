import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { finalizeVeoRender } from '@/lib/veo-render'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'

const PROPOSALS_BUCKET = 'proposals'

type FinalizeProposalVideoBody = {
  operation_name: string
  slug: string
  job_id?: string
  business_name?: string
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  let jobId: string | undefined
  let businessName: string | undefined

  try {
    const body = (await request.json()) as FinalizeProposalVideoBody
    const { job_id, business_name } = body
    const operation_name = sanitizeN8nString(body.operation_name)
    const slug = sanitizeN8nString(body.slug)
    jobId = job_id
    businessName = business_name

    if (!operation_name || !slug) {
      return NextResponse.json({ error: 'operation_name and slug are required' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      status: 'running',
      step: 'Downloading Veo video',
      progressPercent: 94,
    })

    const videoBuffer = await finalizeVeoRender(operation_name)

    const filePath = `${slug}/video.mp4`
    const { error: uploadError } = await supabase.storage
      .from(PROPOSALS_BUCKET)
      .upload(filePath, videoBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from(PROPOSALS_BUCKET).getPublicUrl(filePath)
    const videoUrl = data.publicUrl

    const { error: dbError } = await supabase
      .from('leads')
      .update({ video_url: videoUrl })
      .eq('slug', slug)

    if (dbError) throw dbError

    revalidatePath(`/proposal/${slug}`)

    await updateProposalJobProgress(supabase, {
      jobId: job_id,
      businessName: business_name,
      status: 'completed',
      step: 'Video ready',
      progressPercent: 100,
    })

    return NextResponse.json({ video_url: videoUrl })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-proposal-video/finalize]', message)

    if (jobId) {
      try {
        const supabase = await createAdminClient()
        await updateProposalJobProgress(supabase, {
          jobId,
          businessName,
          status: 'failed',
          step: 'Video finalize skipped',
          progressPercent: 94,
          errorMessage: message,
        })
      } catch (progressError) {
        console.error('[generate-proposal-video/finalize/progress]', progressError)
      }
    }

    // Non-fatal — the proposal already has a still image. Log and skip.
    return NextResponse.json({ skipped: true, reason: message })
  }
}

function sanitizeN8nString(value: string) {
  return value
    .trim()
    .replace(/^=+/, '')
    .replace(/^"+|"+$/g, '')
    .trim()
}
