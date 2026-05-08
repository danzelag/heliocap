'use client'

import { useEffect, useMemo, useState, useTransition, type SetStateAction } from 'react'
import Link from 'next/link'
import { Activity, ChevronDown, ChevronRight, ExternalLink, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { clearProposalQueueAction } from '@/app/admin/pipeline/actions'
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

function statusClass(status: ProposalJob['status']) {
  if (status === 'completed') return 'border-emerald-900/60 bg-emerald-950/25 text-emerald-300'
  if (status === 'failed') return 'border-red-900/60 bg-red-950/25 text-red-300'
  if (status === 'running') return 'border-sky-900/60 bg-sky-950/25 text-sky-300'
  return 'border-stone-700/70 bg-stone-900/60 text-stone-400'
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function sortJobs(jobs: ProposalJob[]) {
  return [...jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12)
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

  const activeCount = useMemo(() => jobs.filter((j) => j.status === 'queued' || j.status === 'running').length, [jobs])
  const finishedCount = useMemo(() => jobs.filter((j) => !isBatchJob(j) && (j.status === 'completed' || j.status === 'failed')).length, [jobs])

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
    if (!window.confirm(`Clear ${finishedCount} completed/failed job${finishedCount === 1 ? '' : 's'} from the queue?`)) return
    setClearError(null)
    startClearTransition(async () => {
      const result = await clearProposalQueueAction()
      if (!result.success) {
        setClearError(result.error || 'Failed to clear queue.')
      } else {
        setJobs([])
        setEvents([])
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
          .select('id, business_name, address, slug, status, current_step, progress_percent, proposal_url, error_message, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(12),
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

  return (
    <section className={`admin-panel self-start transition-all ${collapsed ? 'p-3 lg:p-4' : 'p-4 lg:p-5'}`}>
      <div className={`flex items-center justify-between ${collapsed ? '' : 'mb-4 border-b border-stone-700/70 pb-4'}`}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2.5 text-left"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
          <Activity className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-sm font-semibold text-stone-100">
            Build queue
            {activeCount > 0 && (
              <span className="ml-2 font-mono text-xs text-sky-400">{activeCount} active</span>
            )}
          </span>
        </button>
        {finishedCount > 0 && (
          <button
            type="button"
            disabled={isClearing}
            onClick={handleClearQueue}
            className="inline-flex items-center gap-1.5 rounded border border-stone-700/70 px-2 py-1 text-xs text-slate-500 transition-colors hover:border-red-900/60 hover:text-red-300 disabled:opacity-50"
          >
            {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Clear {finishedCount}
          </button>
        )}
      </div>

      {clearError && <div className="mb-3 text-xs text-red-300">{clearError}</div>}

      {!collapsed && (
        <div className="overflow-hidden rounded-lg border border-stone-700/70 bg-stone-950/70">
          {jobs.length === 0 ? (
            <div className="p-5 text-sm text-slate-500">No jobs yet.</div>
          ) : (
            <div className="max-h-[680px] divide-y divide-stone-800/80 overflow-y-auto">
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
                              className="rounded border border-stone-700/70 bg-stone-900/60 px-2 py-0.5 text-xs text-stone-300"
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
                return (
                  <div key={job.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-stone-100">{job.business_name}</div>
                        <div className="mt-0.5 truncate text-xs text-slate-500">{job.address}</div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="text-xs text-slate-500">{formatTime(job.updated_at || job.created_at)}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass(job.status)}`}>
                          {job.status}
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

                    {jobEvents.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-l border-stone-700/60 pl-3">
                        {jobEvents.map((event) => {
                          const tone =
                            event.status === 'failed' ? 'text-red-300/80'
                            : event.status === 'completed' ? 'text-emerald-300/80'
                            : event.status === 'running' ? 'text-sky-300/80'
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
      )}
    </section>
  )
}
