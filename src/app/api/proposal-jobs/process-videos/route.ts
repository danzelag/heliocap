import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase-server'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'
import {
  finalizeProposalVideoIfReady,
  getVeoOperationName,
  getVideoLeadId,
  getVideoProspectId,
  startProposalVideoRender,
  type ProposalVideoJob,
  type ProposalVideoReferenceSet,
} from '@/lib/proposal-video-workflow'

type VideoJobRow = ProposalVideoJob & {
  lead_id: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
}

export async function GET(request: NextRequest) {
  return processPendingProposalVideos(request)
}

export async function POST(request: NextRequest) {
  return processPendingProposalVideos(request)
}

async function processPendingProposalVideos(request: NextRequest) {
  const authorized = await isAuthorized(request)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from('proposal_jobs')
    .select('id, business_name, address, slug, lead_id, proposal_url, status, receipt')
    .in('status', ['running', 'failed'])
    .order('updated_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[proposal-jobs/process-videos] lookup failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const videoJobs = ((data as VideoJobRow[] | null) || [])
    .filter((job) => getVeoOperationName(job.receipt) || isRetryableFailedVideo(job))

  const results = []
  for (const job of videoJobs) {
    try {
      const operationName = getVeoOperationName(job.receipt)
      const leadId = getVideoLeadId(job)
      const prospectId = getVideoProspectId(job.receipt)
      const result = operationName && job.status === 'running'
        ? await finalizeProposalVideoIfReady({
          supabase,
          job,
          operationName,
          leadId,
          prospectId,
        })
        : await startProposalVideoRender({
          supabase,
          job,
          leadId: leadId || '',
          prospectId,
          referenceSet: getReferenceSet(job),
        })

      results.push({
        jobId: job.id,
        slug: job.slug,
        done: result.done,
        videoUrl: result.videoUrl,
      })
    } catch (jobError) {
      const message = describeError(jobError)
      console.error('[proposal-jobs/process-videos] finalize failed', {
        jobId: job.id,
        slug: job.slug,
        message,
      })

      await updateProposalJobProgress(supabase, {
        jobId: job.id,
        businessName: job.business_name,
        status: 'failed',
        step: 'Veo video failed',
        progressPercent: 100,
        errorMessage: message,
        receipt: {
          ...(job.receipt || {}),
          build_status: 'failed',
          build_status_label: 'Failed',
          video_complete: false,
          video_error: message,
          updated_at: new Date().toISOString(),
        },
      })

      results.push({
        jobId: job.id,
        slug: job.slug,
        done: false,
        failed: true,
        error: message,
      })
    }
  }

  return NextResponse.json({
    success: true,
    checked: videoJobs.length,
    results,
  })
}

function isRetryableFailedVideo(job: VideoJobRow) {
  const receipt = job.receipt || {}
  return job.status === 'failed' &&
    receipt.video_required === true &&
    receipt.video_complete !== true &&
    Boolean(getVideoLeadId(job)) &&
    Boolean(receipt.reference_set || receipt.visual_references)
}

function getReferenceSet(job: VideoJobRow): ProposalVideoReferenceSet {
  const referenceSet = job.receipt?.reference_set || job.receipt?.visual_references
  if (!referenceSet || typeof referenceSet !== 'object' || Array.isArray(referenceSet)) {
    throw new Error('Retrying Veo video requires a stored reference_set')
  }

  const record = referenceSet as Record<string, unknown>
  return {
    mapTilesImageUrl: getString(record.mapTilesImageUrl),
    solarPanelRenderUrl: getString(record.solarPanelRenderUrl),
    aerialViewReferenceUrl: getString(record.aerialViewReferenceUrl),
    cleanedPreviewImageUrl: getString(record.cleanedPreviewImageUrl),
    solarApiLayoutImageUrl: getString(record.solarApiLayoutImageUrl),
    streetViewReferenceUrls: Array.isArray(record.streetViewReferenceUrls)
      ? record.streetViewReferenceUrls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      : [],
  }
}

async function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return Boolean(user)
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
