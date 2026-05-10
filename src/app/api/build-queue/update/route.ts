import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { recordProposalJobEvent, type ProposalJobStatus } from '@/lib/proposal-job-events'

const buildStatuses = [
  'queued',
  'processing',
  'qualified',
  'filtered_out',
  'image_generating',
  'image_generated',
  'video_rendering',
  'video_complete',
  'proposal_publishing',
  'proposal_published',
  'failed',
] as const

type BuildStatus = (typeof buildStatuses)[number]

type BuildQueueUpdateBody = {
  buildId?: string
  slug?: string
  status?: string
  reason?: string
  data?: Record<string, unknown>
}

type ProposalJobRow = {
  id: string
  business_name: string
  receipt: Record<string, unknown> | null
}

const statusConfig: Record<BuildStatus, {
  jobStatus: ProposalJobStatus
  label: string
  progress: number
  terminalError?: boolean
}> = {
  queued: { jobStatus: 'queued', label: 'Queued', progress: 2 },
  processing: { jobStatus: 'running', label: 'Processing', progress: 12 },
  qualified: { jobStatus: 'running', label: 'Qualified', progress: 28 },
  filtered_out: { jobStatus: 'failed', label: 'Filtered Out', progress: 100, terminalError: true },
  image_generating: { jobStatus: 'running', label: 'Generating Image', progress: 45 },
  image_generated: { jobStatus: 'running', label: 'Image Generated', progress: 62 },
  video_rendering: { jobStatus: 'running', label: 'Rendering Video', progress: 82 },
  video_complete: { jobStatus: 'running', label: 'Video Complete', progress: 92 },
  proposal_publishing: { jobStatus: 'running', label: 'Publishing Proposal', progress: 96 },
  proposal_published: { jobStatus: 'completed', label: 'Proposal Ready', progress: 100 },
  failed: { jobStatus: 'failed', label: 'Failed', progress: 100, terminalError: true },
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as BuildQueueUpdateBody
    const buildId = body.buildId?.trim()
    const slug = body.slug?.trim() || getString(body.data?.slug)
    const queueIdentifier = buildId || slug
    const status = body.status?.trim() as BuildStatus | undefined

    if (!queueIdentifier) {
      return NextResponse.json({ error: 'buildId or slug is required' }, { status: 400 })
    }

    if (!status || !buildStatuses.includes(status)) {
      return NextResponse.json({
        error: 'Unsupported build queue status',
        supported_statuses: buildStatuses,
      }, { status: 400 })
    }

    if (body.data !== undefined && (!body.data || typeof body.data !== 'object' || Array.isArray(body.data))) {
      return NextResponse.json({ error: 'data must be an object when provided' }, { status: 400 })
    }

    if (status === 'proposal_published' && !hasVideoComplete(body.data)) {
      return NextResponse.json({
        error: 'video_complete or video_url is required before proposal_published',
      }, { status: 400 })
    }

    const supabase = await createAdminClient()
    let query = supabase
      .from('proposal_jobs')
      .select('id, business_name, receipt')

    query = buildId ? query.eq('id', buildId) : query.eq('slug', slug)

    const { data: existingJob, error: lookupError } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lookupError) throw lookupError
    if (!existingJob) {
      return NextResponse.json({ error: 'Build queue item not found' }, { status: 404 })
    }

    const job = existingJob as ProposalJobRow
    const resolvedBuildId = job.id
    const config = statusConfig[status]
    const metadata = mergeMetadata(job.receipt, {
      ...(body.data || {}),
      build_status: status,
      build_status_label: config.label,
      reason: body.reason,
      updated_by: 'n8n',
      updated_at: new Date().toISOString(),
    })
    const proposalUrl = getString(body.data?.proposal_url ?? body.data?.proposalUrl ?? body.data?.url)
    const leadId = getString(body.data?.lead_id ?? body.data?.leadId)
    const reason = body.reason?.trim() || null

    const update: Record<string, unknown> = {
      status: config.jobStatus,
      current_step: reason && config.terminalError ? `${config.label}: ${reason}` : config.label,
      progress_percent: config.progress,
      error_message: config.terminalError ? reason || config.label : null,
      receipt: metadata,
      updated_at: new Date().toISOString(),
    }

    if (proposalUrl !== undefined) update.proposal_url = proposalUrl
    if (leadId !== undefined) update.lead_id = leadId

    const { data: updatedJob, error: updateError } = await supabase
      .from('proposal_jobs')
      .update(update)
      .eq('id', resolvedBuildId)
      .select('id, business_name, status, current_step, progress_percent, proposal_url, error_message, receipt, updated_at')
      .maybeSingle()

    if (updateError) throw updateError
    if (!updatedJob) {
      return NextResponse.json({ error: 'Build queue item not found' }, { status: 404 })
    }

    await recordProposalJobEvent(supabase, {
      jobId: resolvedBuildId,
      businessName: job.business_name,
      status: config.jobStatus,
      step: String(update.current_step),
      progressPercent: config.progress,
      proposalUrl,
      errorMessage: config.terminalError ? reason || config.label : null,
    })

    return NextResponse.json({
      success: true,
      build: updatedJob,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[build-queue/update]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
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

function hasVideoComplete(data: Record<string, unknown> | undefined) {
  if (!data) return false
  return data.video_complete === true || getString(data.video_url ?? data.videoUrl) !== undefined
}
