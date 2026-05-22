import type { ProspectStage } from '@/lib/prospect'

const STALE_RUNNING_MS = 20 * 60 * 1000

export type ProposalJobStatus = 'queued' | 'running' | 'completed' | 'failed'
export type QueueDisplayStatus = ProposalJobStatus | 'not_qualified' | 'stalled'
export type BuildDisplayStatus =
  | 'queued'
  | 'processing'
  | 'qualified'
  | 'filtered_out'
  | 'image_generating'
  | 'image_generated'
  | 'video_rendering'
  | 'video_complete'
  | 'proposal_publishing'
  | 'proposal_published'
  | 'failed'

type ProposalJobLike = {
  status: ProposalJobStatus
  current_step: string
  error_message: string | null
  created_at: string
  updated_at: string
  receipt: Record<string, unknown> | null
}

export const prospectStageLabels: Record<ProspectStage, string> = {
  sourced: 'Sourced',
  coordinate_review: 'Coordinate Review',
  solar_fetched: 'Solar Fetched',
  enriched: 'Enriched',
  microsite_live: 'Live',
  emailed: 'Emailed',
  replied: 'Replied',
  booked: 'Booked',
  snoozed: 'Snoozed',
  dead: 'Not Qualified',
}

export const proposalBuildStatusLabels: Record<BuildDisplayStatus, string> = {
  queued: 'Queued',
  processing: 'Processing',
  qualified: 'Qualified',
  filtered_out: 'Not Qualified',
  image_generating: 'Generating Image',
  image_generated: 'Image Generated',
  video_rendering: 'Legacy Video Render',
  video_complete: 'Legacy Video Complete',
  proposal_publishing: 'Publishing Proposal',
  proposal_published: 'Proposal Ready',
  failed: 'Failed',
}

export const proposalWorkflowSteps: Array<{ id: BuildDisplayStatus; label: string }> = [
  { id: 'queued', label: 'Queued' },
  { id: 'processing', label: 'Started' },
  { id: 'qualified', label: 'Roof' },
  { id: 'image_generating', label: 'Image' },
  { id: 'proposal_publishing', label: 'Publish' },
  { id: 'proposal_published', label: 'Live' },
]

export function getProposalBuildStatus(job: ProposalJobLike): BuildDisplayStatus | null {
  const value = job.receipt?.build_status
  if (typeof value !== 'string') return null
  if (!proposalBuildStatusLabels[value as BuildDisplayStatus]) return null
  return value as BuildDisplayStatus
}

export function getProposalQueueDisplayStatus(job: ProposalJobLike): QueueDisplayStatus {
  const buildStatus = getProposalBuildStatus(job)
  if (buildStatus === 'filtered_out') return 'not_qualified'
  if (buildStatus === 'failed') return 'failed'
  if (buildStatus === 'proposal_published') return 'completed'

  const text = `${job.current_step || ''} ${job.error_message || ''}`
  if (/not\s*qualified|filtered\s*out|disqualified|filter qualified solar targets/i.test(text)) {
    return 'not_qualified'
  }
  if (
    job.status === 'running' &&
    new Date().getTime() - new Date(job.updated_at || job.created_at).getTime() > STALE_RUNNING_MS
  ) {
    return 'stalled'
  }
  return job.status
}

export function getProposalQueueStatusLabel(status: QueueDisplayStatus) {
  if (status === 'not_qualified') return 'Not Qualified'
  if (status === 'stalled') return 'Stalled'
  return status
}

export function getProposalQueueBadgeClass(status: QueueDisplayStatus) {
  if (status === 'completed') return 'admin-status admin-status-success px-2 py-1'
  if (status === 'failed') return 'admin-status admin-status-danger px-2 py-1'
  if (status === 'not_qualified') return 'admin-status admin-status-warning px-2 py-1'
  if (status === 'running') return 'admin-status admin-status-running px-2 py-1'
  if (status === 'stalled') return 'admin-status admin-status-danger px-2 py-1'
  return 'admin-status px-2 py-1'
}

export function getProposalQueueLabel(job: ProposalJobLike, displayStatus = getProposalQueueDisplayStatus(job)) {
  const buildStatus = getProposalBuildStatus(job)
  return buildStatus ? proposalBuildStatusLabels[buildStatus] : getProposalQueueStatusLabel(displayStatus)
}

export function getProposalWorkflowIndex(job: ProposalJobLike) {
  const buildStatus = getProposalBuildStatus(job)
  if (buildStatus === 'image_generated') {
    return proposalWorkflowSteps.findIndex((step) => step.id === 'image_generating')
  }
  if (buildStatus === 'video_complete') {
    return proposalWorkflowSteps.findIndex((step) => step.id === 'proposal_published')
  }
  if (buildStatus) {
    const index = proposalWorkflowSteps.findIndex((step) => step.id === buildStatus)
    if (index >= 0) return index
  }
  if (job.status === 'completed') return proposalWorkflowSteps.length - 1
  if (job.status === 'running') return 1
  return 0
}

export function getProspectStageBadgeClass(stage: ProspectStage) {
  if (stage === 'booked' || stage === 'microsite_live') return 'admin-status admin-status-success px-2.5 py-1'
  if (stage === 'coordinate_review') return 'admin-status admin-status-warning px-2.5 py-1'
  if (stage === 'dead') return 'admin-status admin-status-warning px-2.5 py-1'
  if (stage === 'snoozed') return 'admin-status admin-status-warning px-2.5 py-1'
  if (stage === 'solar_fetched' || stage === 'enriched' || stage === 'emailed' || stage === 'replied') {
    return 'admin-status admin-status-running px-2.5 py-1'
  }
  return 'admin-status px-2.5 py-1'
}

export function getReceiptString(receipt: Record<string, unknown> | null | undefined, key: string) {
  const value = receipt?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
