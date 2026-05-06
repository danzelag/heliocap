'use client'

import { useEffect, useMemo, useState, useTransition, type SetStateAction } from 'react'
import Link from 'next/link'
import { Activity, Check, ChevronDown, ChevronRight, ExternalLink, Loader2, RadioTower, RefreshCcw, Trash2, TriangleAlert } from 'lucide-react'
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

function statusClass(status: ProposalJob['status']) {
  if (status === 'completed') return 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'
  if (status === 'failed') return 'border-red-300/30 bg-red-500/10 text-red-100'
  if (status === 'running') return 'border-cyan-200/30 bg-cyan-200/10 text-cyan-100'
  return 'border-white/10 bg-white/[0.03] text-slate-300'
}

function statusIcon(status: ProposalJob['status']) {
  if (status === 'completed') return <Check className="h-4 w-4 text-emerald-200" />
  if (status === 'failed') return <TriangleAlert className="h-4 w-4 text-red-200" />
  if (status === 'running') return <RadioTower className="h-4 w-4 text-cyan-100" />
  return <Loader2 className="h-4 w-4 text-slate-400" />
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
    .filter((event) => event.job_id === jobId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

export function ProposalJobsQueue({ initialJobs, initialEvents }: ProposalJobsQueueProps) {
  const [jobs, setJobsState] = useState(() => readClientCache<ProposalJob[]>(JOBS_CACHE_KEY) || sortJobs(initialJobs))
  const [events, setEventsState] = useState(() => readClientCache<ProposalJobEvent[]>(EVENTS_CACHE_KEY) || sortEvents(initialEvents))
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [isClearing, startClearTransition] = useTransition()
  const activeCount = useMemo(() => jobs.filter((job) => job.status === 'queued' || job.status === 'running').length, [jobs])
  const finishedCount = useMemo(() => jobs.filter((job) => job.status === 'completed' || job.status === 'failed').length, [jobs])
  const latestEvent = events[0]

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

  useEffect(() => {
    const sortedJobs = sortJobs(initialJobs)
    const sortedEvents = sortEvents(initialEvents)
    setJobsState(sortedJobs)
    setEventsState(sortedEvents)
    writeClientCache(JOBS_CACHE_KEY, sortedJobs)
    writeClientCache(EVENTS_CACHE_KEY, sortedEvents)
  }, [initialJobs, initialEvents])

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
      setLastSyncedAt(new Date())
    }

    refresh()
    const poller = window.setInterval(refresh, 4000)

    const jobsChannel = supabase
      .channel('admin-proposal-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposal_jobs',
        },
        (payload) => {
          const nextJob = (payload.new || payload.old) as ProposalJob | null
          if (!nextJob) return

          setJobs((prev) => {
            const existing = prev.filter((job) => job.id !== nextJob.id)
            return sortJobs([nextJob, ...existing])
          })
          setLastSyncedAt(new Date())
        },
      )
      .subscribe()

    const eventsChannel = supabase
      .channel('admin-proposal-job-events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'proposal_job_events',
        },
        (payload) => {
          const nextEvent = payload.new as ProposalJobEvent
          setEvents((prev) => sortEvents([nextEvent, ...prev]))
          setLastSyncedAt(new Date())
        },
      )
      .subscribe()

    return () => {
      mounted = false
      window.clearInterval(poller)
      supabase.removeChannel(jobsChannel)
      supabase.removeChannel(eventsChannel)
    }
  }, [])

  return (
    <section className={`self-start border border-white/10 bg-[#0b1016]/90 transition-all ${collapsed ? 'p-3 lg:p-4' : 'p-5 lg:p-6'}`}>
      <div className={`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${collapsed ? '' : 'mb-5 border-b border-white/10 pb-4'}`}>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-3 text-left"
        >
          {collapsed ? <ChevronRight className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.26em] text-cyan-200/70">
              <Activity className="h-3.5 w-3.5" />
              Live proposal activity
            </div>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white">Proposal Build Monitor</h2>
          </div>
        </button>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          <span className={activeCount > 0 ? 'text-cyan-100' : ''}>{activeCount} active</span>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" />
            {lastSyncedAt ? formatTime(lastSyncedAt.toISOString()) : 'Syncing'}
          </span>
          {latestEvent ? (
            <span className="text-slate-600">Latest {formatTime(latestEvent.created_at)}</span>
          ) : null}
          {finishedCount > 0 && (
            <button
              type="button"
              disabled={isClearing}
              onClick={handleClearQueue}
              className="inline-flex items-center gap-1.5 border border-white/10 px-2.5 py-1.5 text-slate-400 transition-colors hover:border-red-300/30 hover:text-red-200 disabled:opacity-50"
            >
              {isClearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Clear {finishedCount}
            </button>
          )}
        </div>
      </div>

      {clearError && (
        <div className="mb-4 text-xs text-red-200">{clearError}</div>
      )}

      {!collapsed && <div className="overflow-hidden border border-white/10 bg-[#090d12]">
        {jobs.length === 0 ? (
          <div className="border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-slate-500">
            No proposal jobs yet. Create one proposal or bulk queue prospects and they will appear here.
          </div>
        ) : (
          <div className="max-h-[720px] divide-y divide-white/10 overflow-y-auto">
            {jobs.map((job) => {
              const jobEvents = getJobEvents(events, job.id)
              return (
                <div key={job.id} className="p-4 lg:p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {statusIcon(job.status)}
                        <span className="truncate font-semibold text-white">{job.business_name}</span>
                        <span className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${statusClass(job.status)}`}>
                          {job.status}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">{job.address}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {formatTime(job.updated_at || job.created_at)}
                      </span>
                      {job.proposal_url ? (
                        <Link
                          href={job.proposal_url}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-100 transition-colors hover:bg-emerald-300/20"
                          title="Open proposal"
                        >
                          View proposal
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 border-l border-white/10 pl-4">
                    {jobEvents.length === 0 ? (
                      <div className="py-1 text-xs text-slate-500">{job.error_message || job.current_step || 'Awaiting first event'}</div>
                    ) : (
                      <div className="space-y-2">
                        {jobEvents.map((event) => {
                          const tone = event.status === 'failed'
                            ? 'text-red-100'
                            : event.status === 'completed'
                              ? 'text-emerald-100'
                              : event.status === 'running'
                                ? 'text-cyan-100'
                                : 'text-slate-300'
                          return (
                            <div key={event.id} className="grid grid-cols-[5.5rem_1fr] gap-3 text-xs">
                              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-600">
                                {formatTime(event.created_at)}
                              </div>
                              <div className={tone}>
                                {event.error_message || event.step}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>}
    </section>
  )
}
