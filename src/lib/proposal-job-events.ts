import { SupabaseClient } from '@supabase/supabase-js'

export type ProposalJobStatus = 'queued' | 'running' | 'completed' | 'failed'

type RecordProposalJobEventArgs = {
  jobId: string
  businessName?: string | null
  status: ProposalJobStatus
  step: string
  progressPercent: number
  proposalUrl?: string | null
  errorMessage?: string | null
}

type UpdateProposalJobProgressArgs = {
  jobId?: string | null
  businessName?: string | null
  status: ProposalJobStatus
  step: string
  progressPercent: number
  proposalUrl?: string | null
  leadId?: string | null
  errorMessage?: string | null
  receipt?: Record<string, unknown> | null
}

export async function updateProposalJobProgress(
  supabase: SupabaseClient,
  {
    jobId,
    businessName,
    status,
    step,
    progressPercent,
    proposalUrl,
    leadId,
    errorMessage,
    receipt,
  }: UpdateProposalJobProgressArgs,
) {
  if (!jobId) return

  const update: Record<string, unknown> = {
    status,
    current_step: step,
    progress_percent: Math.max(0, Math.min(100, Math.round(progressPercent))),
  }

  if (proposalUrl !== undefined) update.proposal_url = proposalUrl
  if (leadId !== undefined) update.lead_id = leadId
  if (errorMessage !== undefined) update.error_message = errorMessage
  if (receipt !== undefined) update.receipt = receipt

  const { error } = await supabase
    .from('proposal_jobs')
    .update(update)
    .eq('id', jobId)

  if (error) {
    console.error('[proposal-job-progress]', error.message)
    return
  }

  await recordProposalJobEvent(supabase, {
    jobId,
    businessName,
    status,
    step,
    progressPercent,
    proposalUrl,
    errorMessage,
  })
}

export async function recordProposalJobEvent(
  supabase: SupabaseClient,
  {
    jobId,
    businessName,
    status,
    step,
    progressPercent,
    proposalUrl = null,
    errorMessage = null,
  }: RecordProposalJobEventArgs,
) {
  let eventBusinessName = businessName

  if (!eventBusinessName) {
    const { data } = await supabase
      .from('proposal_jobs')
      .select('business_name')
      .eq('id', jobId)
      .maybeSingle()

    eventBusinessName = data?.business_name || 'Proposal job'
  }

  const { error } = await supabase
    .from('proposal_job_events')
    .insert([{
      job_id: jobId,
      business_name: eventBusinessName,
      status,
      step,
      progress_percent: Math.max(0, Math.min(100, Math.round(progressPercent))),
      proposal_url: proposalUrl,
      error_message: errorMessage,
    }])

  if (error) {
    console.error('[proposal-job-event]', error.message)
  }
}
