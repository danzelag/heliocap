'use client'

import { useEffect, useMemo, useState, useTransition, type SetStateAction } from 'react'
import Link from 'next/link'
import {
  Activity,
  Archive,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { clearProposalQueueAction } from '@/app/admin/pipeline/actions'
import { readClientCache, writeClientCache } from '@/lib/client-cache'

// ─── Types ─────────────────────────────────────────────────────────────────

export type ProposalJob = {
  id: string
  business_name: string
  address: string
  slug: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  current_step: string
  progress_percent: number
  proposal_url: string | null
  error_message: string | null
  receipt: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type ProposalJobEvent = {
  id: string
  job_id: string | null
  business_name: string
  status: ProposalJob['status']
  step: string
  progress_percent: number
  proposal_url: string | null
  error_message: string | null
  created_at: string
}

type ProposalJobsQueueProps = {
  initialJobs: ProposalJob[]
  initialEvents: ProposalJobEvent[]
}

// ─── Constants ─────────────────────────────────────────────────────────────

const JOBS_CACHE_KEY = 'admin:proposal-jobs'
const EVENTS_CACHE_KEY = 'admin:proposal-job-events'
const STALE_RUNNING_MS = 20 * 60 * 1000

type QueueDisplayStatus = ProposalJob['status'] | 'not_qualified' | 'stalled'
type BuildDisplayStatus =
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

// ─── Pure helpers (all unchanged from original) ────────────────────────────

function isBatchJob(job: ProposalJob) {
  return job.slug.startsWith('batch-')
}

function parseBatchAddress(address: string) {
  const [left = '', location = ''] = address.split(' · ')
  const idx = left.indexOf(' ')
  const count = idx > -1 ? left.slice(0, idx) : ''
  const category = idx > -1 ? left.slice(idx + 1) : left
  return { count, category, location }
}

function getDisplayStatus(job: ProposalJob): QueueDisplayStatus {
  const buildStatus = getBuildStatus(job)
  if (buildStatus === 'filtered_out') return 'not_qualified'
  if (buildStatus === 'failed') return 'failed'
  if (buildStatus === 'proposal_published') return 'completed'

  const text = `${job.current_step || ''} ${job.error_message || ''}`
  if (/not\s*qualified|filtered\s*out|disqualified|filter qualified solar targets/i.test(text)) return 'not_qualified'
  if (
    job.status === 'running' &&
    new Date().getTime() - new Date(job.updated_at || job.created_at).getTime() > STALE_RUNNING_MS
  ) {
    return 'stalled'
  }
  return job.status
}

function getBuildStatus(job: ProposalJob): BuildDisplayStatus | null {
  const value = job.receipt?.build_status
  if (typeof value !== 'string') return null
  if (!buildStatusLabels[value as BuildDisplayStatus]) return null
  return value as BuildDisplayStatus
}

function statusLabel(status: QueueDisplayStatus) {
  if (status === 'not_qualified') return 'Not Qualified'
  if (status === 'stalled') return 'Stalled'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

const buildStatusLabels: Record<BuildDisplayStatus, string> = {
  queued: 'Queued',
  processing: 'Processing',
  qualified: 'Qualified',
  filtered_out: 'Not Qualified',
  image_generating: 'Generating Image',
  image_generated: 'Image Generated',
  video_rendering: 'Rendering Video',
  video_complete: 'Video Complete',
  proposal_publishing: 'Publishing Proposal',
  proposal_published: 'Proposal Ready',
  failed: 'Failed',
}

const workflowSteps: Array<{ id: BuildDisplayStatus; label: string }> = [
  { id: 'queued', label: 'Queued' },
  { id: 'processing', label: 'Started' },
  { id: 'qualified', label: 'Roof' },
  { id: 'image_generating', label: 'Image' },
  { id: 'proposal_publishing', label: 'Publish' },
  { id: 'video_rendering', label: 'Video' },
  { id: 'proposal_published', label: 'Live' },
]

function getQueueLabel(job: ProposalJob, displayStatus: QueueDisplayStatus) {
  const buildStatus = getBuildStatus(job)
  return buildStatus ? buildStatusLabels[buildStatus] : statusLabel(displayStatus)
}

function getWorkflowIndex(job: ProposalJob) {
  const buildStatus = getBuildStatus(job)
  if (buildStatus === 'image_generated') return workflowSteps.findIndex((step) => step.id === 'image_generating')
  if (buildStatus === 'video_complete') return workflowSteps.findIndex((step) => step.id === 'video_rendering')
  if (buildStatus) {
    const index = workflowSteps.findIndex((step) => step.id === buildStatus)
    if (index >= 0) return index
  }
  if (job.status === 'completed') return workflowSteps.length - 1
  if (job.status === 'running') return 1
  return 0
}

function getQueueReason(job: ProposalJob) {
  const failure = getFailureDetails(job)
  if (failure) return failure
  const reason = job.receipt?.reason
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  return job.error_message
}

function getReceiptString(receipt: Record<string, unknown> | null | undefined, key: string) {
  const value = receipt?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getFailureDetails(job: ProposalJob) {
  const receipt = job.receipt || {}
  const failure = receipt.failure
  if (failure && typeof failure === 'object' && !Array.isArray(failure)) {
    const failureRecord = failure as Record<string, unknown>
    const message = typeof failureRecord.message === 'string' ? failureRecord.message : null
    const code = typeof failureRecord.code === 'string' ? failureRecord.code : null
    const details = typeof failureRecord.details === 'string' ? failureRecord.details : null
    return [getReceiptString(receipt, 'failure_step'), code, message, details].filter(Boolean).join(' · ')
  }
  return job.error_message
}

function getReferenceCount(job: ProposalJob) {
  const referenceSet = job.receipt?.reference_set || job.receipt?.visual_references
  if (!referenceSet || typeof referenceSet !== 'object' || Array.isArray(referenceSet)) return 0
  const record = referenceSet as Record<string, unknown>
  const streetViews = Array.isArray(record.streetViewReferenceUrls) ? record.streetViewReferenceUrls.length : 0
  return [
    record.solarPanelRenderUrl,
    record.cleanedPreviewImageUrl,
    record.mapTilesImageUrl,
    record.solarApiLayoutImageUrl,
    record.aerialViewReferenceUrl,
  ].filter((value) => typeof value === 'string' && value.trim()).length + streetViews
}

function getWorkflowDiagnostics(job: ProposalJob) {
  const receipt = job.receipt || {}
  return [
    ['Step', job.current_step],
    ['Build', getReceiptString(receipt, 'build_status_label') || getReceiptString(receipt, 'build_status') || getQueueLabel(job, getDisplayStatus(job))],
    ['Failure', getFailureDetails(job)],
    ['Solar model', getReceiptString(receipt, 'solar_model') ? 'available' : receipt.solar_model ? 'available' : null],
    ['References', getReferenceCount(job) ? `${getReferenceCount(job)} collected` : null],
    ['Veo op', getReceiptString(receipt, 'veo_operation_name')],
    ['Video', receipt.video_complete === true ? 'uploaded' : receipt.video_required === true ? 'required' : null],
    ['Proposal', getReceiptString(receipt, 'proposal_url') || job.proposal_url],
  ].filter(([, value]) => value)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatRelativeTime(value: string) {
  const diff = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function sortJobs(jobs: ProposalJob[]) {
  const rank: Record<QueueDisplayStatus, number> = {
    running: 0,
    queued: 1,
    stalled: 2,
    not_qualified: 3,
    failed: 4,
    completed: 5,
  }
  return [...jobs].sort((a, b) => {
    const statusDelta = rank[getDisplayStatus(a)] - rank[getDisplayStatus(b)]
    if (statusDelta !== 0) return statusDelta
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
  }).slice(0, 24)
}

function sortEvents(events: ProposalJobEvent[]) {
  return [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 200)
}

function getJobEvents(events: ProposalJobEvent[], jobId: string) {
  return events
    .filter((e) => e.job_id === jobId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

// ─── Status pill styles ────────────────────────────────────────────────────

function statusPillClass(status: QueueDisplayStatus) {
  if (status === 'completed') return 'cc-pill cc-pill-success'
  if (status === 'running') return 'cc-pill cc-pill-running'
  if (status === 'failed') return 'cc-pill cc-pill-danger'
  if (status === 'stalled') return 'cc-pill cc-pill-danger'
  if (status === 'not_qualified') return 'cc-pill cc-pill-warning'
  return 'cc-pill cc-pill-idle'
}

// ─── Copy helper ──────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

// ─── Component ────────────────────────────────────────────────────────────

export function ProposalJobsQueue({ initialJobs, initialEvents }: ProposalJobsQueueProps) {
  const [jobs, setJobsState] = useState(() => readClientCache<ProposalJob[]>(JOBS_CACHE_KEY) || sortJobs(initialJobs))
  const [events, setEventsState] = useState(() => readClientCache<ProposalJobEvent[]>(EVENTS_CACHE_KEY) || sortEvents(initialEvents))
  const [clearError, setClearError] = useState<string | null>(null)
  const [isClearing, startClearTransition] = useTransition()
  const [logsOpen, setLogsOpen] = useState(false)

  const activeCount = useMemo(() => jobs.filter((j) => {
    const status = getDisplayStatus(j)
    return status === 'queued' || status === 'running'
  }).length, [jobs])

  const finishedCount = useMemo(() => jobs.filter((j) => {
    const status = getDisplayStatus(j)
    return !isBatchJob(j) && (status === 'completed' || status === 'failed' || status === 'not_qualified')
  }).length, [jobs])

  const focusJob = useMemo(() => (
    jobs.find((job) => !isBatchJob(job) && ['running', 'queued'].includes(getDisplayStatus(job))) ||
    jobs.find((job) => !isBatchJob(job)) ||
    null
  ), [jobs])

  const focusEvents = useMemo(() => focusJob ? getJobEvents(events, focusJob.id) : [], [events, focusJob])

  const hasPendingVideo = useMemo(() => jobs.some((job) => {
    const receipt = job.receipt || {}
    const hasOperation = typeof receipt.veo_operation_name === 'string' && receipt.veo_operation_name.trim().length > 0
    const retryableFailedVideo = job.status === 'failed' &&
      receipt.video_required === true &&
      receipt.video_complete !== true &&
      Boolean(receipt.reference_set || receipt.visual_references)
    return (
      job.status === 'running' &&
      receipt.build_status === 'video_rendering' &&
      hasOperation
    ) || retryableFailedVideo
  }), [jobs])

  const setJobs = (next: SetStateAction<ProposalJob[]>) => {
    setJobsState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      writeClientCache(JOBS_CACHE_KEY, resolved)
      return resolved
    })
  }

  const setEvents = (next: SetStateAction<ProposalJobEvent[]>) => {
    setEventsState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next
      writeClientCache(EVENTS_CACHE_KEY, resolved)
      return resolved
    })
  }

  const handleClearQueue = () => {
    if (finishedCount === 0) return
    setClearError(null)
    startClearTransition(async () => {
      const result = await clearProposalQueueAction()
      if (!result.success) {
        setClearError(result.error || 'Failed to clear queue.')
      } else {
        setJobs((prev) => prev.filter((job) => {
          const status = getDisplayStatus(job)
          return status !== 'completed' && status !== 'failed' && status !== 'not_qualified'
        }))
        setEvents((prev) => prev.filter((event) => {
          const job = jobs.find((candidate) => candidate.id === event.job_id)
          if (!job) return false
          const status = getDisplayStatus(job)
          return status !== 'completed' && status !== 'failed' && status !== 'not_qualified'
        }))
      }
    })
  }

  // ── Realtime + polling (unchanged) ──────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    const refresh = async () => {
      const [{ data: jobData }, { data: eventData }] = await Promise.all([
        supabase
          .from('proposal_jobs')
          .select('id, business_name, address, slug, status, current_step, progress_percent, proposal_url, error_message, receipt, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(24),
        supabase
          .from('proposal_job_events')
          .select('id, job_id, business_name, status, step, progress_percent, proposal_url, error_message, created_at')
          .order('created_at', { ascending: false })
          .limit(200),
      ])
      if (!mounted) return
      if (jobData) setJobs(sortJobs(jobData as ProposalJob[]))
      if (eventData) setEvents(sortEvents(eventData as ProposalJobEvent[]))
    }

    refresh()
    const poller = window.setInterval(refresh, 4000)

    const jobsChannel = supabase
      .channel('admin-proposal-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_jobs' }, (payload) => {
        const next = (payload.new || payload.old) as ProposalJob | null
        if (!next) return
        setJobs((prev) => sortJobs([next, ...prev.filter((j) => j.id !== next.id)]))
      })
      .subscribe()

    const eventsChannel = supabase
      .channel('admin-proposal-job-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'proposal_job_events' }, (payload) => {
        setEvents((prev) => sortEvents([payload.new as ProposalJobEvent, ...prev]))
      })
      .subscribe()

    return () => {
      mounted = false
      window.clearInterval(poller)
      supabase.removeChannel(jobsChannel)
      supabase.removeChannel(eventsChannel)
    }
  }, [])

  useEffect(() => {
    if (!hasPendingVideo) return
    let stopped = false
    const processVideos = async () => {
      try {
        await fetch('/api/proposal-jobs/process-videos', { method: 'POST', cache: 'no-store' })
      } catch (error) {
        if (!stopped) console.error('[ProposalJobsQueue] video processor failed', error)
      }
    }
    processVideos()
    const poller = window.setInterval(processVideos, 20000)
    return () => { stopped = true; window.clearInterval(poller) }
  }, [hasPendingVideo])

  // ── Render ───────────────────────────────────────────────────────────────

  const focusDisplayStatus = focusJob ? getDisplayStatus(focusJob) : null
  const focusWorkflowIndex = focusJob ? getWorkflowIndex(focusJob) : -1
  const isRunning = focusDisplayStatus === 'running'
  const isCompleted = focusDisplayStatus === 'completed'

  return (
    <section className="cc-mission-grid">

      {/* ── LEFT: Active Proposal Hero ─────────────────────────── */}
      <div className="cc-hero-card">
        {/* Header */}
        <div className="cc-hero-header">
          <div className="flex items-center gap-2.5">
            <Activity className={`h-4 w-4 ${isRunning ? 'text-[#d99a3d] animate-pulse' : 'text-[#6b7885]'}`} />
            <span className="cc-section-eyebrow">Active Workflow</span>
            {activeCount > 0 && (
              <span className="cc-live-badge">
                <span className="cc-pulse-dot" />
                {activeCount} active
              </span>
            )}
          </div>
          {finishedCount > 0 && (
            <button
              type="button"
              disabled={isClearing}
              onClick={handleClearQueue}
              className="cc-ghost-btn flex items-center gap-1.5 text-xs"
            >
              {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear {finishedCount}
            </button>
          )}
        </div>

        {clearError && <div className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{clearError}</div>}

        {/* Focus Job */}
        {focusJob ? (
          <>
            {/* Name + Status */}
            <div className="cc-hero-identity">
              <div className="min-w-0 flex-1">
                <div className="cc-hero-name">{focusJob.business_name}</div>
                <div className="cc-hero-address">{focusJob.address}</div>
              </div>
              <span className={statusPillClass(focusDisplayStatus!)}>
                {getQueueLabel(focusJob, focusDisplayStatus!)}
              </span>
            </div>

            {/* Progress bar */}
            <div className="cc-progress-track">
              <div
                className={`cc-progress-fill ${isRunning ? 'cc-progress-fill-active' : ''}`}
                style={{ width: `${Math.max(4, Math.min(100, focusJob.progress_percent || 0))}%` }}
              />
            </div>
            <div className="cc-progress-pct">
              {Math.round(focusJob.progress_percent || 0)}%
            </div>

            {/* Workflow Pipeline */}
            <div className="cc-pipeline">
              {workflowSteps.map((step, index) => {
                const done = index < focusWorkflowIndex || isCompleted
                const current = index === focusWorkflowIndex && !isCompleted
                const failed = (focusDisplayStatus === 'failed' || focusDisplayStatus === 'stalled') && index === focusWorkflowIndex
                return (
                  <div key={step.id} className="cc-pipeline-step">
                    <div className={`cc-pipeline-node ${done ? 'cc-node-done' : ''} ${current ? 'cc-node-current' : ''} ${failed ? 'cc-node-failed' : ''}`}>
                      {done && !current && (
                        <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    {index < workflowSteps.length - 1 && (
                      <div className={`cc-pipeline-connector ${done ? 'cc-connector-done' : ''}`} />
                    )}
                    <span className={`cc-pipeline-label ${done || current ? 'cc-label-active' : ''}`}>{step.label}</span>
                  </div>
                )
              })}
            </div>

            {/* Failure reason */}
            {(focusDisplayStatus === 'failed' || focusDisplayStatus === 'not_qualified') && getQueueReason(focusJob) && (
              <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300 leading-relaxed">
                {getQueueReason(focusJob)}
              </div>
            )}

            {/* Workflow Logs — collapsed by default */}
            <details
              className="cc-logs-accordion"
              open={logsOpen}
              onToggle={(e) => setLogsOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cc-logs-summary">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${logsOpen ? 'rotate-180' : ''}`} />
                Workflow Logs
                {focusEvents.length > 0 && <span className="cc-logs-count">{focusEvents.length}</span>}
              </summary>
              <div className="cc-logs-body">
                {/* Live diagnostics */}
                {getWorkflowDiagnostics(focusJob).length > 0 && (
                  <div className="cc-diag-grid">
                    {getWorkflowDiagnostics(focusJob).map(([label, value]) => (
                      <div key={label} className="cc-diag-row">
                        <span className="cc-diag-label">{label}</span>
                        <span className="cc-diag-value">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Event timeline */}
                {focusEvents.length > 0 && (
                  <div className="cc-event-list">
                    {[...focusEvents].reverse().map((event) => {
                      const tone =
                        /not\s*qualified|filtered\s*out|disqualified|filter qualified/i.test(`${event.step} ${event.error_message || ''}`) ? 'text-[#f0c27a]'
                        : event.status === 'failed' ? 'text-red-300/80'
                        : event.status === 'completed' ? 'text-[#d99a3d]/80'
                        : event.status === 'running' ? 'text-[#d99a3d]'
                        : 'text-[#6b7885]'
                      return (
                        <div key={event.id} className="cc-event-row">
                          <span className="cc-event-time">{formatTime(event.created_at)}</span>
                          <span className={`cc-event-text ${tone}`}>{event.error_message || event.step}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {focusEvents.length === 0 && getWorkflowDiagnostics(focusJob).length === 0 && (
                  <div className="py-3 text-center text-xs text-[#6b7885]">No log entries yet.</div>
                )}
              </div>
            </details>
          </>
        ) : (
          <div className="cc-hero-empty">
            <Activity className="mx-auto mb-3 h-8 w-8 text-[#3a4048]" />
            <div className="text-sm font-medium text-[#4a5560]">No active workflow</div>
            <div className="mt-1 text-xs text-[#3a4048]">Queue a proposal to get started</div>
          </div>
        )}
      </div>

      {/* ── CENTER: Action Rail ────────────────────────────────── */}
      <div className="cc-action-rail">
        <div className="cc-section-eyebrow mb-4">Actions</div>
        <div className="flex flex-col gap-2">
          {focusJob?.proposal_url ? (
            <Link href={focusJob.proposal_url} target="_blank" className="cc-action-btn cc-action-btn-primary">
              <ExternalLink className="h-3.5 w-3.5" />
              View Proposal
            </Link>
          ) : (
            <button type="button" disabled className="cc-action-btn cc-action-btn-primary opacity-40 cursor-not-allowed">
              <ExternalLink className="h-3.5 w-3.5" />
              View Proposal
            </button>
          )}

          <button
            type="button"
            onClick={() => focusJob?.proposal_url && copyToClipboard(focusJob.proposal_url)}
            disabled={!focusJob?.proposal_url}
            className="cc-action-btn cc-action-btn-ghost"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy Link
          </button>

          <button
            type="button"
            disabled={!focusJob}
            className="cc-action-btn cc-action-btn-ghost"
            onClick={() => {
              if (!focusJob) return
              const subject = encodeURIComponent(`Solar proposal for ${focusJob.business_name}`)
              const body = encodeURIComponent(focusJob.proposal_url ? `View your proposal: ${focusJob.proposal_url}` : '')
              window.open(`mailto:?subject=${subject}&body=${body}`)
            }}
          >
            <Mail className="h-3.5 w-3.5" />
            Send Email
          </button>

          {/* NOTE: Retry and Archive require backend actions not yet wired to this component.
              The buttons are rendered for visual completeness but are intentionally disabled. */}
          <button type="button" disabled className="cc-action-btn cc-action-btn-ghost opacity-40 cursor-not-allowed">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>

          <button type="button" disabled className="cc-action-btn cc-action-btn-ghost opacity-40 cursor-not-allowed">
            <Archive className="h-3.5 w-3.5" />
            Archive
          </button>
        </div>

        {/* Divider */}
        <div className="my-5 h-px bg-[#252a30]" />

        {/* Mini stats */}
        <div className="space-y-3">
          <div className="cc-mini-stat">
            <span className="cc-mini-stat-label">Queue</span>
            <span className="cc-mini-stat-value">{jobs.filter(j => !isBatchJob(j)).length}</span>
          </div>
          <div className="cc-mini-stat">
            <span className="cc-mini-stat-label">Active</span>
            <span className={`cc-mini-stat-value ${activeCount > 0 ? 'text-[#d99a3d]' : ''}`}>{activeCount}</span>
          </div>
          <div className="cc-mini-stat">
            <span className="cc-mini-stat-label">Done</span>
            <span className="cc-mini-stat-value">{jobs.filter(j => getDisplayStatus(j) === 'completed').length}</span>
          </div>
          <div className="cc-mini-stat">
            <span className="cc-mini-stat-label">Failed</span>
            <span className={`cc-mini-stat-value ${jobs.filter(j => getDisplayStatus(j) === 'failed').length > 0 ? 'text-red-400' : ''}`}>
              {jobs.filter(j => getDisplayStatus(j) === 'failed').length}
            </span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Job Queue List ──────────────────────────────── */}
      <div className="cc-queue-panel">
        <div className="cc-queue-header">
          <span className="cc-section-eyebrow">Proposal Queue</span>
          <span className="cc-queue-count">{jobs.length}</span>
        </div>

        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-sm text-[#4a5560]">No jobs in queue</div>
          </div>
        ) : (
          <div className="cc-queue-list">
            {jobs.map((job) => {
              if (isBatchJob(job)) {
                const { count, category, location } = parseBatchAddress(job.address)
                return (
                  <div key={job.id} className="cc-queue-row cc-queue-row-batch">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-[#4a5560]">Batch</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {[count, category, location].filter(Boolean).map((chip) => (
                        <span key={chip} className="cc-chip">{chip}</span>
                      ))}
                    </div>
                    <div className="mt-1.5 text-[10px] text-[#3a4048]">{formatRelativeTime(job.created_at)}</div>
                  </div>
                )
              }

              const displayStatus = getDisplayStatus(job)
              const isFocus = focusJob?.id === job.id

              return (
                <div key={job.id} className={`cc-queue-row ${isFocus ? 'cc-queue-row-focus' : ''}`}>
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className={`cc-queue-name ${isFocus ? 'text-[#e8d5b0]' : ''}`}>{job.business_name}</div>
                      <div className="cc-queue-address">{job.address}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={statusPillClass(displayStatus)}>
                        {getQueueLabel(job, displayStatus)}
                      </span>
                      <span className="text-[10px] text-[#4a5560]">{formatRelativeTime(job.updated_at || job.created_at)}</span>
                    </div>
                  </div>

                  {job.proposal_url && (
                    <Link
                      href={job.proposal_url}
                      target="_blank"
                      className="mt-2 inline-flex items-center gap-1 text-[10px] text-[#d99a3d]/70 hover:text-[#d99a3d] transition-colors"
                    >
                      View proposal <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  )}

                  {(displayStatus === 'failed' || displayStatus === 'not_qualified') && getQueueReason(job) && (
                    <div className="mt-2 rounded border border-red-500/15 bg-red-500/5 px-2 py-1.5 text-[10px] text-red-300/80 leading-relaxed">
                      {getQueueReason(job)}
                    </div>
                  )}

                  {/* Per-row logs — collapsed by default */}
                  {job.receipt && (
                    <details className="cc-row-logs">
                      <summary className="cc-row-logs-summary">Technical details</summary>
                      <div className="mt-1.5 space-y-1">
                        {getWorkflowDiagnostics(job).map(([label, value]) => (
                          <div key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-1.5 text-[10px]">
                            <span className="text-[#4a5560]">{label}</span>
                            <span className="break-words text-[#8a929c]">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
