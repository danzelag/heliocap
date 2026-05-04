import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { recordProposalJobEvent, type ProposalJobStatus } from '@/lib/proposal-job-events'

const allowedStatuses = ['queued', 'running', 'completed', 'failed'] as const

type UpdateProposalJobPayload = {
  job_id?: string
  jobId?: string
  status?: ProposalJobStatus
  current_step?: string
  step?: string
  message?: string
  node_name?: string
  nodeName?: string
  execution_id?: string
  executionId?: string
  progress_percent?: number
  progress?: number
  proposal_url?: string | null
  proposalUrl?: string | null
  lead_id?: string | null
  leadId?: string | null
  error_message?: string | null
  errorMessage?: string | null
  receipt?: Record<string, unknown> | null
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as UpdateProposalJobPayload
    const jobId = body.job_id || body.jobId

    if (!jobId) {
      return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
    }

    const status = body.status || 'running'
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid job status' }, { status: 400 })
    }

    const currentStep = (body.current_step || body.step || body.message || body.node_name || body.nodeName || '').trim()
    if (!currentStep) {
      return NextResponse.json({ error: 'current_step, step, message, or node_name is required' }, { status: 400 })
    }

    const progressPercent = Number(body.progress_percent ?? body.progress ?? 0)
    if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      return NextResponse.json({ error: 'progress_percent must be between 0 and 100' }, { status: 400 })
    }

    const supabase = await createAdminClient()
    const update: Record<string, unknown> = {
      status,
      current_step: currentStep,
      progress_percent: Math.round(progressPercent),
    }
    const proposalUrl = body.proposal_url ?? body.proposalUrl ?? null
    const leadId = body.lead_id ?? body.leadId ?? null
    const errorMessage = body.error_message ?? body.errorMessage ?? null
    const receipt = body.receipt || {}
    if (body.execution_id || body.executionId) {
      receipt.execution_id = body.execution_id || body.executionId
    }
    if (body.node_name || body.nodeName) {
      receipt.node_name = body.node_name || body.nodeName
    }

    if ('proposal_url' in body || 'proposalUrl' in body) update.proposal_url = proposalUrl
    if ('lead_id' in body || 'leadId' in body) update.lead_id = leadId
    if ('error_message' in body || 'errorMessage' in body) update.error_message = errorMessage
    if ('receipt' in body || body.execution_id || body.executionId || body.node_name || body.nodeName) update.receipt = receipt

    const { data: job, error } = await supabase
      .from('proposal_jobs')
      .update(update)
      .eq('id', jobId)
      .select('id, business_name, status, current_step, progress_percent, proposal_url, error_message')
      .maybeSingle()

    if (error) throw error
    if (!job) return NextResponse.json({ error: 'Proposal job not found' }, { status: 404 })

    await recordProposalJobEvent(supabase, {
      jobId,
      businessName: job.business_name,
      status,
      step: currentStep,
      progressPercent,
      proposalUrl,
      errorMessage,
    })

    return NextResponse.json({ success: true, job })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[proposal-jobs/update]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
