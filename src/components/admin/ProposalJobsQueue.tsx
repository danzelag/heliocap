'use client'

import { useEffect, useMemo, useState, useTransition, type SetStateAction } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock3,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  Mail,
  MapPinned,
  RadioTower,
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
  | 'queued' | 'processing' | 'qualified' | 'filtered_out'
  | 'image_generating' | 'image_generated' | 'video_rendering' | 'video_complete'
  | 'proposal_publishing' | 'proposal_published' | 'failed'

// ─── Helpers ───────────────────────────────────────────────────────────────

function isBatchJob(j: ProposalJob) { return j.slug.startsWith('batch-') }

function parseBatchAddress(address: string) {
  const [left = '', location = ''] = address.split(' · ')
  const idx = left.indexOf(' ')
  return { count: idx > -1 ? left.slice(0, idx) : '', category: idx > -1 ? left.slice(idx + 1) : left, location }
}

const buildStatusLabels: Record<BuildDisplayStatus, string> = {
  queued: 'Queued', processing: 'Processing', qualified: 'Qualified', filtered_out: 'Not Qualified',
  image_generating: 'Generating', image_generated: 'Image Ready', video_rendering: 'Rendering',
  video_complete: 'Video Done', proposal_publishing: 'Publishing', proposal_published: 'Live', failed: 'Failed',
}

function getBuildStatus(job: ProposalJob): BuildDisplayStatus | null {
  const v = job.receipt?.build_status
  if (typeof v !== 'string' || !buildStatusLabels[v as BuildDisplayStatus]) return null
  return v as BuildDisplayStatus
}

function getDisplayStatus(job: ProposalJob): QueueDisplayStatus {
  const bs = getBuildStatus(job)
  if (bs === 'filtered_out') return 'not_qualified'
  if (bs === 'failed') return 'failed'
  if (bs === 'proposal_published') return 'completed'
  const text = `${job.current_step || ''} ${job.error_message || ''}`
  if (/not\s*qualified|filtered\s*out|disqualified|filter qualified solar targets/i.test(text)) return 'not_qualified'
  if (job.status === 'running' && Date.now() - new Date(job.updated_at || job.created_at).getTime() > STALE_RUNNING_MS) return 'stalled'
  return job.status
}

function getQueueLabel(job: ProposalJob, ds: QueueDisplayStatus) {
  const bs = getBuildStatus(job)
  if (bs) return buildStatusLabels[bs]
  if (ds === 'not_qualified') return 'Not Qualified'
  if (ds === 'stalled') return 'Stalled'
  return ds.charAt(0).toUpperCase() + ds.slice(1)
}

function getReceiptStr(receipt: Record<string, unknown> | null | undefined, key: string) {
  const v = receipt?.[key]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function getFailureDetails(job: ProposalJob) {
  const r = job.receipt || {}
  const f = r.failure
  if (f && typeof f === 'object' && !Array.isArray(f)) {
    const fo = f as Record<string, unknown>
    return [
      getReceiptStr(r, 'failure_step'),
      typeof fo.code === 'string' ? fo.code : null,
      typeof fo.message === 'string' ? fo.message : null,
      typeof fo.details === 'string' ? fo.details : null,
    ].filter(Boolean).join(' · ')
  }
  return job.error_message
}

function getQueueReason(job: ProposalJob) {
  const f = getFailureDetails(job)
  if (f) return f
  const r = job.receipt?.reason
  if (typeof r === 'string' && r.trim()) return r.trim()
  return job.error_message
}

function getJobRenderUrl(job: ProposalJob): string | null {
  const ref = job.receipt?.reference_set || job.receipt?.visual_references
  const direct =
    getReceiptStr(job.receipt, 'render_preview_url') ||
    getReceiptStr(job.receipt, 'render_url') ||
    getReceiptStr(job.receipt, 'solar_panel_render_url')
  if (direct) return direct
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return null
  const r = ref as Record<string, unknown>
  return (
    (typeof r.solarPanelRenderUrl === 'string' && r.solarPanelRenderUrl) ||
    (typeof r.cleanedPreviewImageUrl === 'string' && r.cleanedPreviewImageUrl) ||
    (typeof r.solarApiLayoutImageUrl === 'string' && r.solarApiLayoutImageUrl) ||
    null
  )
}

function sortJobs(jobs: ProposalJob[]) {
  const rank: Record<QueueDisplayStatus, number> = { running: 0, queued: 1, stalled: 2, not_qualified: 3, failed: 4, completed: 5 }
  return [...jobs].sort((a, b) => {
    const d = rank[getDisplayStatus(a)] - rank[getDisplayStatus(b)]
    return d !== 0 ? d : new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
  }).slice(0, 24)
}

function sortEvents(events: ProposalJobEvent[]) {
  return [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 200)
}

function getJobEvents(events: ProposalJobEvent[], jobId: string) {
  return events.filter((e) => e.job_id === jobId).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

function copyToClipboard(text: string) { navigator.clipboard.writeText(text).catch(() => {}) }

function formatRelTime(value: string) {
  const d = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  return `${Math.floor(d / 3600)}h`
}

const WORKFLOW_STEPS = [
  { id: 'queued', label: 'Queued', percent: 0 },
  { id: 'solar', label: 'Solar data fetched', percent: 18 },
  { id: 'layout', label: 'Black panel layout generated', percent: 42 },
  { id: 'reference', label: 'Reference image uploaded', percent: 58 },
  { id: 'publish', label: 'Proposal published', percent: 82 },
  { id: 'live', label: 'Live', percent: 100 },
]

const statusStyles: Record<QueueDisplayStatus, { label: string; dot: string; fg: string; bg: string; border: string }> = {
  running: { label: 'Running', dot: '#d99a3d', fg: '#e2a64f', bg: 'rgba(217,154,61,0.10)', border: '#3a2f1e' },
  queued: { label: 'Queued', dot: '#7c8694', fg: '#a8b1bb', bg: 'rgba(124,134,148,0.08)', border: '#363c45' },
  completed: { label: 'Live', dot: '#7ba87a', fg: '#8eb98c', bg: 'rgba(123,168,122,0.08)', border: '#34433a' },
  failed: { label: 'Failed', dot: '#c4685e', fg: '#d77c70', bg: 'rgba(196,104,94,0.10)', border: '#3a2521' },
  not_qualified: { label: 'Not qualified', dot: '#7c8694', fg: '#7c8694', bg: 'rgba(124,134,148,0.06)', border: '#363c45' },
  stalled: { label: 'Stalled', dot: '#c4685e', fg: '#d77c70', bg: 'rgba(196,104,94,0.10)', border: '#3a2521' },
}

function StatusBadge({ status, label }: { status: QueueDisplayStatus; label?: string }) {
  const tone = statusStyles[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em]"
      style={{ color: tone.fg, background: tone.bg, borderColor: tone.border }}
    >
      <span
        className={status === 'running' ? 'h-1.5 w-1.5 animate-pulse rounded-full' : 'h-1.5 w-1.5 rounded-full'}
        style={{ background: tone.dot }}
      />
      {label || tone.label}
    </span>
  )
}

function getReceiptArray(receipt: Record<string, unknown> | null | undefined, key: string) {
  const value = receipt?.[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function getReceiptRecord(receipt: Record<string, unknown> | null | undefined, key: string) {
  const value = receipt?.[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function StepLadder({ job, events }: { job: ProposalJob; events: ProposalJobEvent[] }) {
  const status = getDisplayStatus(job)
  const failureStep = getReceiptStr(job.receipt, 'failure_step')
  const failedEvent = events.find((event) => event.status === 'failed')
  const percent = status === 'completed' ? 100 : Math.max(0, Math.min(100, job.progress_percent || 0))

  return (
    <ol className="space-y-0">
      {WORKFLOW_STEPS.map((step, index) => {
        const reached = percent >= step.percent || status === 'completed'
        const nextPercent = WORKFLOW_STEPS[index + 1]?.percent ?? 101
        const current = status === 'running' && percent >= step.percent && percent < nextPercent
        const failedHere = status === 'failed' && (current || failureStep?.includes(step.id) || failedEvent?.step?.toLowerCase().includes(step.id))
        const dotClass = failedHere
          ? 'border-[#3a2521] bg-[#2a1714] text-[#d77c70]'
          : reached
            ? 'border-[#34433a] bg-[#18241b] text-[#8eb98c]'
            : current
              ? 'border-[#3a2f1e] bg-[#23190f] text-[#d99a3d]'
              : 'border-[#363c45] bg-transparent text-[#4c5460]'
        const textClass = failedHere ? 'text-[#d77c70]' : reached || current ? 'text-[#e8e4dc]' : 'text-[#5c6672]'

        return (
          <li key={step.id} className="relative flex gap-3 pb-3 last:pb-0">
            {index < WORKFLOW_STEPS.length - 1 && (
              <span className="absolute left-[9px] top-[18px] h-full w-px bg-[#2a2e36]" />
            )}
            <span className={`relative z-10 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border ${dotClass}`}>
              {failedHere ? (
                <AlertTriangle className="h-2.5 w-2.5" />
              ) : reached ? (
                <CheckCircle2 className="h-2.5 w-2.5" />
              ) : current ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-[12px] ${textClass}`}>{step.label}</span>
                <span className="font-mono text-[10px] text-[#4c5460]">{step.percent}%</span>
              </div>
              {failedHere && getFailureDetails(job) && (
                <div className="mt-1 line-clamp-2 font-mono text-[10px] leading-snug text-[#a86157]">{getFailureDetails(job)}</div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─── Component ────────────────────────────────────────────────────────────

export function ProposalJobsQueue({ initialJobs, initialEvents }: ProposalJobsQueueProps) {
  const [jobs, setJobsState] = useState(() => readClientCache<ProposalJob[]>(JOBS_CACHE_KEY) || sortJobs(initialJobs))
  const [events, setEventsState] = useState(() => readClientCache<ProposalJobEvent[]>(EVENTS_CACHE_KEY) || sortEvents(initialEvents))
  const [clearError, setClearError] = useState<string | null>(null)
  const [isClearing, startClearTransition] = useTransition()
  const [overrideJobId, setOverrideJobId] = useState<string | null>(null)

  const activeCount = useMemo(() => jobs.filter((j) => { const s = getDisplayStatus(j); return s === 'queued' || s === 'running' }).length, [jobs])
  const finishedCount = useMemo(() => jobs.filter((j) => { const s = getDisplayStatus(j); return !isBatchJob(j) && (s === 'completed' || s === 'failed' || s === 'not_qualified') }).length, [jobs])

  const focusJob = useMemo(() => (
    jobs.find((j) => !isBatchJob(j) && ['running', 'queued'].includes(getDisplayStatus(j))) ||
    jobs.find((j) => !isBatchJob(j)) || null
  ), [jobs])

  const selectedJob = useMemo(() => {
    if (overrideJobId) { const o = jobs.find((j) => j.id === overrideJobId); if (o) return o }
    return focusJob
  }, [overrideJobId, jobs, focusJob])

  const hasPendingVideo = useMemo(() => jobs.some((job) => {
    const r = job.receipt || {}
    const hasOp = typeof r.veo_operation_name === 'string' && r.veo_operation_name.trim().length > 0
    const retryFail = job.status === 'failed' && r.video_required === true && r.video_complete !== true && Boolean(r.reference_set || r.visual_references)
    return (job.status === 'running' && r.build_status === 'video_rendering' && hasOp) || retryFail
  }), [jobs])

  const setJobs = (next: SetStateAction<ProposalJob[]>) => setJobsState((prev) => {
    const r = typeof next === 'function' ? next(prev) : next
    writeClientCache(JOBS_CACHE_KEY, r); return r
  })

  const setEvents = (next: SetStateAction<ProposalJobEvent[]>) => setEventsState((prev) => {
    const r = typeof next === 'function' ? next(prev) : next
    writeClientCache(EVENTS_CACHE_KEY, r); return r
  })

  const handleClearQueue = () => {
    if (finishedCount === 0) return
    setClearError(null)
    startClearTransition(async () => {
      const result = await clearProposalQueueAction()
      if (!result.success) { setClearError(result.error || 'Failed to clear queue.'); return }
      setJobs((prev) => prev.filter((j) => { const s = getDisplayStatus(j); return s !== 'completed' && s !== 'failed' && s !== 'not_qualified' }))
      setEvents((prev) => prev.filter((e) => { const j = jobs.find((c) => c.id === e.job_id); if (!j) return false; const s = getDisplayStatus(j); return s !== 'completed' && s !== 'failed' && s !== 'not_qualified' }))
    })
  }

  useEffect(() => {
    const supabase = createClient(); let mounted = true
    const refresh = async () => {
      const [{ data: jd }, { data: ed }] = await Promise.all([
        supabase.from('proposal_jobs').select('id, business_name, address, slug, status, current_step, progress_percent, proposal_url, error_message, receipt, created_at, updated_at').order('created_at', { ascending: false }).limit(24),
        supabase.from('proposal_job_events').select('id, job_id, business_name, status, step, progress_percent, proposal_url, error_message, created_at').order('created_at', { ascending: false }).limit(200),
      ])
      if (!mounted) return
      if (jd) setJobs(sortJobs(jd as ProposalJob[]))
      if (ed) setEvents(sortEvents(ed as ProposalJobEvent[]))
    }
    refresh()
    const poller = window.setInterval(refresh, 4000)
    const jc = supabase.channel('admin-proposal-jobs').on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_jobs' }, (p) => {
      const next = (p.new || p.old) as ProposalJob | null
      if (next) setJobs((prev) => sortJobs([next, ...prev.filter((j) => j.id !== next.id)]))
    }).subscribe()
    const ec = supabase.channel('admin-proposal-job-events').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'proposal_job_events' }, (p) => {
      setEvents((prev) => sortEvents([p.new as ProposalJobEvent, ...prev]))
    }).subscribe()
    return () => { mounted = false; window.clearInterval(poller); supabase.removeChannel(jc); supabase.removeChannel(ec) }
  }, [])

  useEffect(() => {
    if (!hasPendingVideo) return
    let stopped = false
    const run = async () => { try { await fetch('/api/proposal-jobs/process-videos', { method: 'POST', cache: 'no-store' }) } catch (e) { if (!stopped) console.error(e) } }
    run(); const p = window.setInterval(run, 20000)
    return () => { stopped = true; window.clearInterval(p) }
  }, [hasPendingVideo])

  const selectedDisplayStatus = selectedJob ? getDisplayStatus(selectedJob) : null
  const renderUrl = selectedJob ? getJobRenderUrl(selectedJob) : null
  const selectedEvents = selectedJob ? getJobEvents(events, selectedJob.id) : []
  const visibleJobs = jobs.filter((job) => !isBatchJob(job))

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="overflow-hidden rounded-lg border border-[#2a2e36] bg-[#1f2229] shadow-[0_18px_44px_rgba(0,0,0,0.24)]">
        {selectedJob && selectedDisplayStatus ? (
          <>
            <header className="flex flex-col gap-3 border-b border-[#2a2e36] bg-[#1c1e24] px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c6672]">Active proposal job</span>
                  <span className="font-mono text-[10px] text-[#4c5460]">{selectedJob.id}</span>
                </div>
                <h2 className="mt-1 truncate text-[20px] font-semibold leading-tight text-[#e8e4dc]">{selectedJob.business_name}</h2>
                <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] text-[#7c8694]">
                  <MapPinned className="h-3 w-3 shrink-0 text-[#5c6672]" />
                  <span className="truncate">{selectedJob.address}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                <StatusBadge status={selectedDisplayStatus} label={getQueueLabel(selectedJob, selectedDisplayStatus)} />
                {selectedJob.proposal_url ? (
                  <>
                    <Link
                      href={selectedJob.proposal_url}
                      target="_blank"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#d99a3d] px-3 text-[12px] font-bold text-[#1a0e00] transition hover:bg-[#e6a84a]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => selectedJob.proposal_url && copyToClipboard(selectedJob.proposal_url)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#363c45] bg-[#23262d] px-3 text-[12px] font-semibold text-[#a8b1bb] transition hover:border-[#4c5460] hover:text-[#e8e4dc]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </button>
                  </>
                ) : (
                  <span className="inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded-md border border-[#2a2e36] px-3 text-[12px] text-[#5c6672]">
                    <ExternalLink className="h-3.5 w-3.5" />
                    No URL yet
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const subject = encodeURIComponent(`Solar proposal for ${selectedJob.business_name}`)
                    const body = encodeURIComponent(selectedJob.proposal_url ? `View your proposal: ${selectedJob.proposal_url}` : '')
                    window.open(`mailto:?subject=${subject}&body=${body}`)
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#363c45] bg-[#23262d] px-3 text-[12px] font-semibold text-[#a8b1bb] transition hover:border-[#4c5460] hover:text-[#e8e4dc]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </button>
              </div>
            </header>

            <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_310px]">
              <div className="min-w-0 border-b border-[#2a2e36] bg-[#15171c] lg:border-b-0 lg:border-r">
                <div className="relative aspect-[16/10] min-h-[320px] overflow-hidden">
                  {renderUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={renderUrl} alt={`Generated proposal render for ${selectedJob.business_name}`} className="absolute inset-0 h-full w-full object-contain p-4" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center p-6">
                      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                        {selectedDisplayStatus === 'running' || selectedDisplayStatus === 'queued' ? (
                          <Loader2 className="h-8 w-8 animate-spin text-[#d99a3d]/70" />
                        ) : selectedDisplayStatus === 'failed' || selectedDisplayStatus === 'stalled' ? (
                          <AlertTriangle className="h-8 w-8 text-[#d77c70]" />
                        ) : (
                          <Activity className="h-8 w-8 text-[#4c5460]" />
                        )}
                        <div>
                          <div className="text-[13px] font-semibold text-[#e8e4dc]">
                            {selectedDisplayStatus === 'failed' || selectedDisplayStatus === 'stalled' ? 'Render not available' : 'Render pending'}
                          </div>
                          <div className="mt-1 text-[11px] leading-5 text-[#7c8694]">
                            The customer-facing proposal should use the generated Solar API render. Raw map imagery is intentionally hidden here.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-[#2a2e36] bg-[#1c1e24]/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#7c8694] backdrop-blur">
                    <Layers className="h-3 w-3" />
                    {renderUrl ? 'deterministic render' : 'awaiting render'}
                  </div>
                  <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-[#2a2e36] bg-[#1c1e24]/90 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#7c8694] backdrop-blur">
                    black panels only
                  </div>
                </div>

                <div className="border-t border-[#2a2e36] px-5 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[12px] text-[#e8e4dc]">
                        <CircleDot className="h-3.5 w-3.5 text-[#d99a3d]" />
                        <span className="truncate font-medium">{selectedJob.current_step || getQueueLabel(selectedJob, selectedDisplayStatus)}</span>
                      </div>
                      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-[#272a31]">
                        <div
                          className={selectedDisplayStatus === 'running' ? 'h-full bg-[#d99a3d] transition-all' : 'h-full transition-all'}
                          style={{
                            width: `${Math.max(0, Math.min(100, selectedJob.progress_percent || (selectedDisplayStatus === 'completed' ? 100 : 0)))}%`,
                            background: statusStyles[selectedDisplayStatus].fg,
                          }}
                        />
                      </div>
                    </div>
                    <div className="font-mono text-[22px] font-light tabular-nums text-[#e8e4dc]">
                      {Math.round(selectedJob.progress_percent || (selectedDisplayStatus === 'completed' ? 100 : 0))}
                      <span className="text-[#4c5460]">%</span>
                    </div>
                  </div>
                </div>
              </div>

              <aside className="bg-[#1c1e24]">
                <div className="border-b border-[#2a2e36] px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c6672]">Workflow</div>
                  <div className="mt-1 font-mono text-[10px] text-[#7c8694]">in-app · live events</div>
                </div>
                <div className="px-4 py-4">
                  <StepLadder job={selectedJob} events={selectedEvents} />
                </div>
              </aside>
            </div>

            <div className="grid border-t border-[#2a2e36] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <details className="border-b border-[#2a2e36] px-5 py-4 lg:border-b-0 lg:border-r">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c6672]">Render diagnostics</span>
                  <span className="text-[11px] text-[#7c8694]">technical logs hidden</span>
                </summary>
                <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-[11px] sm:grid-cols-3">
                  <div>
                    <dt className="text-[9.5px] uppercase tracking-[0.16em] text-[#4c5460]">render source</dt>
                    <dd className="mt-1 truncate text-[#e8e4dc]">{getReceiptStr(selectedJob.receipt, 'render_source') || 'pending'}</dd>
                  </div>
                  <div>
                    <dt className="text-[9.5px] uppercase tracking-[0.16em] text-[#4c5460]">quality</dt>
                    <dd className="mt-1 text-[#e8e4dc]">{getReceiptStr(selectedJob.receipt, 'render_quality') || getReceiptStr(selectedJob.receipt, 'render_quality_status') || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[9.5px] uppercase tracking-[0.16em] text-[#4c5460]">layers</dt>
                    <dd className="mt-1 truncate text-[#e8e4dc]">{getReceiptArray(selectedJob.receipt, 'solar_data_layers').join(' · ') || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[9.5px] uppercase tracking-[0.16em] text-[#4c5460]">build status</dt>
                    <dd className="mt-1 text-[#e8e4dc]">{getReceiptStr(selectedJob.receipt, 'build_status') || selectedJob.status}</dd>
                  </div>
                  <div>
                    <dt className="text-[9.5px] uppercase tracking-[0.16em] text-[#4c5460]">updated</dt>
                    <dd className="mt-1 text-[#e8e4dc]">{formatRelTime(selectedJob.updated_at)} ago</dd>
                  </div>
                  <div>
                    <dt className="text-[9.5px] uppercase tracking-[0.16em] text-[#4c5460]">events</dt>
                    <dd className="mt-1 text-[#e8e4dc]">{selectedEvents.length}</dd>
                  </div>
                </dl>
                {getQueueReason(selectedJob) && (
                  <div className="mt-4 rounded-md border border-[#3a2521] bg-[#241814] px-3 py-2 font-mono text-[10.5px] leading-5 text-[#d77c70]">
                    {getQueueReason(selectedJob)}
                  </div>
                )}
                {getReceiptRecord(selectedJob.receipt, 'failure') && (
                  <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-[#2a2e36] bg-[#13151a] p-3 text-[10px] leading-5 text-[#7c8694]">
                    {JSON.stringify(getReceiptRecord(selectedJob.receipt, 'failure'), null, 2)}
                  </pre>
                )}
              </details>

              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c6672]">Event stream</span>
                  <span className="font-mono text-[10px] text-[#4c5460]">{events.length} total</span>
                </div>
                <ol className="mt-3 max-h-[190px] space-y-2 overflow-y-auto pr-1">
                  {[...selectedEvents].reverse().slice(0, 12).map((event) => {
                    const failed = event.status === 'failed' || Boolean(event.error_message)
                    return (
                      <li key={event.id} className="flex items-start gap-2.5">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${failed ? 'bg-[#c4685e]' : event.status === 'completed' ? 'bg-[#7ba87a]' : event.status === 'running' ? 'bg-[#d99a3d]' : 'bg-[#7c8694]'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[11.5px] text-[#e8e4dc]">{event.step || event.status}</span>
                            <span className="shrink-0 font-mono text-[10px] text-[#4c5460]">{formatRelTime(event.created_at)} ago</span>
                          </div>
                          {event.error_message && <div className="mt-0.5 truncate font-mono text-[10px] text-[#a86157]">{event.error_message}</div>}
                        </div>
                      </li>
                    )
                  })}
                  {selectedEvents.length === 0 && (
                    <li className="rounded-md border border-dashed border-[#2a2e36] px-3 py-6 text-center text-[12px] text-[#5c6672]">No events recorded yet.</li>
                  )}
                </ol>
              </div>
            </div>
          </>
        ) : (
          <div className="grid min-h-[360px] place-items-center p-8 text-center">
            <div>
              <Activity className="mx-auto h-9 w-9 text-[#4c5460]" />
              <div className="mt-3 text-[14px] font-semibold text-[#e8e4dc]">No proposal jobs yet</div>
              <p className="mt-1 max-w-sm text-[12px] leading-5 text-[#7c8694]">Queue a prospect to watch the generation workflow here.</p>
            </div>
          </div>
        )}
      </div>

      <aside className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-[#2a2e36] bg-[#1f2229]">
        <header className="flex items-center justify-between gap-3 border-b border-[#2a2e36] bg-[#1c1e24] px-4 py-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c6672]">Queue rail</div>
            <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-[#7c8694]">
              <span>{activeCount} active</span>
              <span className="text-[#3d444d]">·</span>
              <span>{visibleJobs.length} visible</span>
            </div>
          </div>
          {finishedCount > 0 && (
            <button
              type="button"
              disabled={isClearing}
              onClick={handleClearQueue}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#363c45] bg-[#23262d] px-2 text-[11px] font-semibold text-[#a8b1bb] transition hover:border-[#4c5460] hover:text-[#e8e4dc] disabled:opacity-50"
            >
              {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear {finishedCount}
            </button>
          )}
        </header>
        {clearError && <div className="border-b border-[#3a2521] bg-[#241814] px-4 py-2 text-[11px] text-[#d77c70]">{clearError}</div>}
        <div className="flex-1 overflow-y-auto">
          {jobs.filter(isBatchJob).map((job) => {
            const { count, category, location } = parseBatchAddress(job.address)
            return (
              <div key={job.id} className="border-b border-[#272a31] px-4 py-3 text-[11px] text-[#7c8694]">
                <span className="font-bold uppercase tracking-wider text-[#a8b1bb]">Batch</span> {count} {category}{location ? ` · ${location}` : ''}
              </div>
            )
          })}
          {visibleJobs.map((job) => {
            const status = getDisplayStatus(job)
            const tone = statusStyles[status]
            const selected = selectedJob?.id === job.id
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => setOverrideJobId(job.id === overrideJobId ? null : job.id)}
                className={`w-full border-b border-[#272a31] px-4 py-3 text-left transition ${selected ? 'bg-[#15120b]/55 shadow-[inset_2px_0_0_#d99a3d]' : 'hover:bg-[#23262d]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={status === 'running' ? 'h-1.5 w-1.5 animate-pulse rounded-full' : 'h-1.5 w-1.5 rounded-full'} style={{ background: tone.dot }} />
                      <span className="truncate text-[12.5px] font-semibold text-[#e8e4dc]">{job.business_name}</span>
                    </div>
                    <div className="mt-1 truncate text-[10.5px] text-[#7c8694]">{getQueueLabel(job, status)}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[10.5px] tabular-nums" style={{ color: tone.fg }}>
                      {status === 'completed' ? '100%' : status === 'failed' ? 'fail' : status === 'queued' ? 'wait' : `${Math.round(job.progress_percent || 0)}%`}
                    </div>
                    <div className="font-mono text-[9.5px] text-[#4c5460]">{formatRelTime(job.updated_at || job.created_at)} ago</div>
                  </div>
                </div>
                {status !== 'queued' && (
                  <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-[#272a31]">
                    <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, job.progress_percent || (status === 'completed' ? 100 : 0)))}%`, background: tone.fg }} />
                  </div>
                )}
              </button>
            )
          })}
          {visibleJobs.length === 0 && jobs.filter(isBatchJob).length === 0 && (
            <div className="px-4 py-10 text-center text-[12px] text-[#5c6672]">Queue is empty.</div>
          )}
        </div>
        <footer className="border-t border-[#2a2e36] bg-[#1c1e24] px-4 py-2.5">
          <div className="flex items-center justify-between font-mono text-[10px] text-[#7c8694]">
            <span className="inline-flex items-center gap-1.5"><RadioTower className="h-3 w-3 text-[#7ba87a]" /> realtime</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" /> 4s poll</span>
          </div>
        </footer>
      </aside>
    </section>
  )
}
