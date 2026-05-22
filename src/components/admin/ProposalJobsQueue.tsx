'use client'

import { useEffect, useMemo, useState, useTransition, type SetStateAction } from 'react'
import Link from 'next/link'
import { Activity, ChevronDown, ChevronRight, ExternalLink, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { clearProposalQueueAction } from '@/app/admin/pipeline/actions'
import {
  getProposalBuildStatus,
  getProposalQueueBadgeClass,
  getProposalQueueDisplayStatus,
  getProposalQueueLabel,
  getProposalWorkflowIndex,
  getReceiptString,
  proposalWorkflowSteps,
  type BuildDisplayStatus,
  type QueueDisplayStatus,
} from '@/lib/admin-pipeline'
import { readClientCache, writeClientCache } from '@/lib/client-cache'

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

const JOBS_CACHE_KEY = 'admin:proposal-jobs'
const EVENTS_CACHE_KEY = 'admin:proposal-job-events'

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
  return getProposalQueueDisplayStatus(job)
}

function getBuildStatus(job: ProposalJob): BuildDisplayStatus | null {
  return getProposalBuildStatus(job)
}

function statusClass(status: QueueDisplayStatus) {
  return getProposalQueueBadgeClass(status)
}

function getQueueLabel(job: ProposalJob, displayStatus: QueueDisplayStatus) {
  return getProposalQueueLabel(job, displayStatus)
}

function getWorkflowIndex(job: ProposalJob) {
  return getProposalWorkflowIndex(job)
}

function getQueueReason(job: ProposalJob) {
  const failure = getFailureDetails(job)
  if (failure) return failure
  const reason = job.receipt?.reason
  if (typeof reason === 'string' && reason.trim()) return reason.trim()
  return job.error_message
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
  const solarDebug = getSolarDebug(receipt)
  const solarLayers = getSolarLayerAssets(receipt)
  return [
    ['Step', job.current_step],
    ['Build', getReceiptString(receipt, 'build_status_label') || getReceiptString(receipt, 'build_status') || getQueueLabel(job, getDisplayStatus(job))],
    ['Failure', getFailureDetails(job)],
    ['Solar model', getReceiptString(receipt, 'solar_model') ? 'available' : receipt.solar_model ? 'available' : null],
    ['Solar layout', solarDebug ? `${solarDebug.selectedPanelCount}/${solarDebug.apiPanelCandidates} panels · ${solarDebug.selectedSegmentCount} roof segment${solarDebug.selectedSegmentCount === 1 ? '' : 's'}` : null],
    ['Solar layers', solarLayers.length ? `${solarLayers.filter((layer) => layer.previewUrl || layer.originalUrl).length}/${solarLayers.length} saved` : null],
    ['References', getReferenceCount(job) ? `${getReferenceCount(job)} collected` : null],
    ['Media', receipt.video_required === false ? 'still image' : receipt.video_required === true ? 'video required' : null],
    ['Proposal', getReceiptString(receipt, 'proposal_url') || job.proposal_url],
  ].filter(([, value]) => value)
}

function getSolarLayerAssets(receipt: Record<string, unknown> | null | undefined) {
  const value = receipt?.solar_data_layers
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const layers = (value as Record<string, unknown>).layers
  if (!Array.isArray(layers)) return []

  return layers
    .filter((layer): layer is Record<string, unknown> => Boolean(layer) && typeof layer === 'object' && !Array.isArray(layer))
    .map((layer) => ({
      id: typeof layer.id === 'string' ? layer.id : '',
      label: typeof layer.label === 'string' ? layer.label : 'Solar layer',
      previewUrl: typeof layer.previewUrl === 'string' && layer.previewUrl.trim() ? layer.previewUrl.trim() : null,
      originalUrl: typeof layer.originalUrl === 'string' && layer.originalUrl.trim() ? layer.originalUrl.trim() : null,
      error: typeof layer.error === 'string' && layer.error.trim() ? layer.error.trim() : null,
      contentType: typeof layer.contentType === 'string' && layer.contentType.trim() ? layer.contentType.trim() : null,
    }))
}

function getSolarDebug(receipt: Record<string, unknown> | null | undefined) {
  const value = receipt?.solar_layout_debug
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const selectedSegments = Array.isArray(record.selectedSegments) ? record.selectedSegments : []
  return {
    apiPanelCandidates: typeof record.apiPanelCandidates === 'number' ? record.apiPanelCandidates : 0,
    selectedPanelCount: typeof record.selectedPanelCount === 'number' ? record.selectedPanelCount : 0,
    selectedSegmentCount: selectedSegments.length,
    raw: record,
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
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

export function ProposalJobsQueue({ initialJobs, initialEvents }: ProposalJobsQueueProps) {
  const [jobs, setJobsState] = useState(() => readClientCache<ProposalJob[]>(JOBS_CACHE_KEY) || sortJobs(initialJobs))
  const [events, setEventsState] = useState(() => readClientCache<ProposalJobEvent[]>(EVENTS_CACHE_KEY) || sortEvents(initialEvents))
  const [collapsed, setCollapsed] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [isClearing, startClearTransition] = useTransition()

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
  const focusEvents = useMemo(() => focusJob ? getJobEvents(events, focusJob.id).slice(-5).reverse() : [], [events, focusJob])
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
        await fetch('/api/proposal-jobs/process-videos', {
          method: 'POST',
          cache: 'no-store',
        })
      } catch (error) {
        if (!stopped) console.error('[ProposalJobsQueue] video processor failed', error)
      }
    }

    processVideos()
    const poller = window.setInterval(processVideos, 20000)
    return () => {
      stopped = true
      window.clearInterval(poller)
    }
  }, [hasPendingVideo])

  return (
    <section className={`admin-panel admin-ops-panel min-w-0 self-start overflow-hidden rounded-lg border border-[#30343b] bg-[#181a1f] shadow-[0_14px_34px_rgba(0,0,0,0.24)] transition-all ${collapsed ? 'p-3 lg:p-4' : 'p-4 lg:p-5'}`}>
      <div className={`flex items-center justify-between ${collapsed ? '' : 'admin-divider mb-3 border-b pb-3'}`}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2.5 text-left"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
          <Activity className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm font-semibold text-stone-100">
            Live workflow
            {activeCount > 0 && (
              <span className="ml-2 font-mono text-xs text-primary">{activeCount} active</span>
            )}
          </span>
        </button>
        {finishedCount > 0 && (
          <button
            type="button"
            disabled={isClearing}
            onClick={handleClearQueue}
            className="admin-subtle-button inline-flex items-center gap-1.5 px-2 py-1 text-xs transition-colors hover:text-red-300 disabled:opacity-50"
          >
            {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Clear {finishedCount}
          </button>
        )}
      </div>

      {clearError && <div className="mb-3 text-xs text-red-300">{clearError}</div>}

      {!collapsed && (
        <div className="space-y-3">
          <div className="admin-live-card min-w-0 overflow-hidden rounded-lg border border-[#343a42] bg-[#15171b] p-3.5">
            {focusJob ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase text-slate-500">Current job</div>
                    <div className="mt-1 truncate text-base font-semibold text-stone-50">{focusJob.business_name}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{focusJob.current_step}</div>
                  </div>
                  <span className={statusClass(getDisplayStatus(focusJob))}>{getQueueLabel(focusJob, getDisplayStatus(focusJob))}</span>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#2a2f36]">
                  <div
                    className="h-full rounded-full bg-[#d99a3d] transition-all"
                    style={{ width: `${Math.max(4, Math.min(100, focusJob.progress_percent || 0))}%` }}
                  />
                </div>
                <div className="admin-mini-workflow mt-4 grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3 2xl:grid-cols-6">
                  {proposalWorkflowSteps.map((step, index) => {
                    const currentIndex = getWorkflowIndex(focusJob)
                    const done = index < currentIndex || getDisplayStatus(focusJob) === 'completed'
                    const current = index === currentIndex && getDisplayStatus(focusJob) !== 'completed'
                    return (
                      <div key={step.id} className={`admin-mini-step flex min-w-0 items-center gap-1.5 text-[0.68rem] font-bold uppercase ${done ? 'admin-mini-step-done' : ''} ${current ? 'admin-mini-step-current' : ''}`}>
                        <span className="admin-mini-dot" />
                        <span>{step.label}</span>
                      </div>
                    )
                  })}
                </div>
                {focusEvents.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {focusEvents.map((event) => (
                      <div key={event.id} className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs">
                        <span className="text-slate-600">{formatTime(event.created_at)}</span>
                        <span className="truncate text-slate-400">{event.error_message || event.step}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 rounded-lg border border-stone-800 bg-stone-950/60 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase text-slate-500">Live diagnostics</div>
                  <div className="grid gap-2 text-xs">
                    {getWorkflowDiagnostics(focusJob).map(([label, value]) => (
                      <div key={label} className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                        <span className="text-slate-600">{label}</span>
                        <span className="min-w-0 break-words text-slate-300">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="p-2 text-sm text-slate-500">No active proposal workflow.</div>
            )}
          </div>

          <div className="admin-scroll-panel min-w-0 overflow-hidden rounded-lg border border-[#30343b] bg-[#202329]">
          {jobs.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">No jobs yet.</div>
          ) : (
            <div className="max-h-[320px] divide-y divide-stone-800/80 overflow-y-auto">
              {jobs.map((job) => {
                if (isBatchJob(job)) {
                  const { count, category, location } = parseBatchAddress(job.address)
                  return (
                    <div key={job.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                          Gather proposals
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {[count, category, location].filter(Boolean).map((chip) => (
                            <span
                              key={chip}
                              className="admin-chip px-2 py-0.5 text-xs"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-slate-600">{formatTime(job.created_at)}</span>
                    </div>
                  )
                }

                const jobEvents = getJobEvents(events, job.id)
                const displayStatus = getDisplayStatus(job)
                return (
                  <div key={job.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-stone-100">{job.business_name}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{job.address}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-xs text-slate-500">{formatTime(job.updated_at || job.created_at)}</span>
                        <span className={statusClass(displayStatus)}>
                          {getQueueLabel(job, displayStatus)}
                        </span>
                        {job.proposal_url ? (
                          <Link
                            href={job.proposal_url}
                            target="_blank"
                            className="inline-flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-stone-100"
                            title="Open proposal"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {(displayStatus === 'not_qualified' || displayStatus === 'failed') && getQueueReason(job) ? (
                      <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                        {getQueueReason(job)}
                      </div>
                    ) : null}

                    {job.receipt && (
                      <details className="mt-2 rounded-lg border border-stone-800 bg-stone-950/50 px-3 py-2 text-xs">
                        <summary className="cursor-pointer text-slate-400">Workflow details</summary>
                        <div className="mt-2 grid gap-1.5">
                          {getWorkflowDiagnostics(job).map(([label, value]) => (
                            <div key={label} className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
                              <span className="text-slate-600">{label}</span>
                              <span className="min-w-0 break-words text-slate-300">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                        {getSolarDebug(job.receipt) ? (
                          <details className="mt-3 rounded-md border border-stone-800 bg-black/20 px-2 py-2">
                            <summary className="cursor-pointer text-slate-400">Solar API layout data</summary>
                            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-mono text-[0.68rem] leading-relaxed text-slate-300">
                              {JSON.stringify(getSolarDebug(job.receipt)?.raw, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                        {getSolarLayerAssets(job.receipt).length ? (
                          <details className="mt-3 rounded-md border border-stone-800 bg-black/20 px-2 py-2">
                            <summary className="cursor-pointer text-slate-400">Solar data layer previews</summary>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              {getSolarLayerAssets(job.receipt).map((layer) => (
                                <div key={layer.id || layer.label} className="overflow-hidden rounded-md border border-stone-800 bg-stone-950">
                                  <div className="flex items-center justify-between gap-2 border-b border-stone-800 px-2 py-1.5">
                                    <span className="text-[11px] font-semibold text-stone-200">{layer.label}</span>
                                    {layer.originalUrl ? (
                                      <Link
                                        href={layer.originalUrl}
                                        target="_blank"
                                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-stone-100"
                                      >
                                        TIFF <ExternalLink className="h-3 w-3" />
                                      </Link>
                                    ) : null}
                                  </div>
                                  {layer.previewUrl ? (
                                    <Link href={layer.previewUrl} target="_blank">
                                      <img
                                        src={layer.previewUrl}
                                        alt={layer.label}
                                        className="aspect-video w-full bg-black object-contain"
                                        loading="lazy"
                                      />
                                    </Link>
                                  ) : (
                                    <div className="px-2 py-3 text-[11px] text-amber-200">
                                      {layer.error || 'Preview unavailable.'}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </details>
                    )}

                    {jobEvents.length > 0 && (
                      <div className="admin-divider mt-3 space-y-1.5 border-l pl-3">
                        {jobEvents.map((event) => {
                          const tone =
                            /not\s*qualified|filtered\s*out|disqualified|filter qualified/i.test(`${event.step} ${event.error_message || ''}`) ? 'text-amber-300'
                            : event.status === 'failed' ? 'text-red-300/80'
                            : event.status === 'completed' ? 'text-emerald-300/80'
                            : event.status === 'running' ? 'text-primary'
                            : 'text-stone-500'
                          return (
                            <div key={event.id} className="grid grid-cols-[5rem_1fr] gap-2 text-xs">
                              <span className="text-slate-600">{formatTime(event.created_at)}</span>
                              <span className={tone}>{event.error_message || event.step}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          </div>
        </div>
      )}
    </section>
  )
}
