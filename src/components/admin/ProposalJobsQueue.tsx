'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, Check, ExternalLink, Loader2, RadioTower, RefreshCcw, TriangleAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase'

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
  }).format(new Date(value))
}

function sortJobs(jobs: ProposalJob[]) {
  return [...jobs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12)
}

function sortEvents(events: ProposalJobEvent[]) {
  return [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 25)
}

export function ProposalJobsQueue({ initialJobs, initialEvents }: ProposalJobsQueueProps) {
  const [jobs, setJobs] = useState(() => sortJobs(initialJobs))
  const [events, setEvents] = useState(() => sortEvents(initialEvents))
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const activeCount = useMemo(() => jobs.filter((job) => job.status === 'queued' || job.status === 'running').length, [jobs])

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
          .limit(25),
      ])

      if (!mounted) return
      if (jobData) setJobs(sortJobs(jobData as ProposalJob[]))
      if (eventData) setEvents(sortEvents(eventData as ProposalJobEvent[]))
      setLastSyncedAt(new Date())
    }

    refresh()
    const poller = window.setInterval(refresh, 5000)

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
    <section className="border border-white/10 bg-[#0b1016]/90 p-5 lg:p-6">
      <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.26em] text-cyan-200/70">
            <Activity className="h-4 w-4" />
            n8n worker telemetry
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Live production queue</h2>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          <span>{activeCount} active</span>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" />
            {lastSyncedAt ? formatTime(lastSyncedAt.toISOString()) : 'Syncing'}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">Active jobs</div>
          {jobs.length === 0 ? (
            <div className="border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-slate-500">
              No proposal jobs yet. Create one proposal or bulk queue prospects and they will appear here.
            </div>
          ) : (
            jobs.slice(0, 6).map((job) => (
              <div key={job.id} className="border border-white/10 bg-[#090d12] p-4">
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
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      {job.error_message || job.current_step}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {formatTime(job.updated_at || job.created_at)}
                    </span>
                    {job.proposal_url ? (
                      <Link
                        href={job.proposal_url}
                        target="_blank"
                        className="inline-flex h-9 w-9 items-center justify-center border border-white/10 text-slate-300 transition-colors hover:border-cyan-200/30 hover:text-cyan-100"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    <span>Job {job.id.slice(0, 8)}</span>
                    <span>{job.progress_percent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden bg-white/10">
                    <div
                      className={`h-full transition-all duration-500 ${job.status === 'failed' ? 'bg-red-300' : job.status === 'completed' ? 'bg-emerald-300' : 'bg-cyan-200'}`}
                      style={{ width: `${job.progress_percent}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="overflow-hidden border border-white/10 bg-[#090d12]">
          <div className="border-b border-white/10 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
            Last 25 workflow actions
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="sticky top-0 bg-[#090d12]">
                <tr className="border-b border-white/10 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Doing</th>
                  <th className="px-4 py-3 text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                      No workflow events yet. n8n progress updates will land here.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="hover:bg-white/[0.025]">
                      <td className="px-4 py-3 align-top font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        {formatTime(event.created_at)}
                      </td>
                      <td className="max-w-[11rem] px-4 py-3 align-top">
                        <div className="truncate font-medium text-white">{event.business_name}</div>
                        <div className={`mt-1 inline-flex border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${statusClass(event.status)}`}>
                          {event.status}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-slate-400">
                        {event.error_message || event.step}
                      </td>
                      <td className="px-4 py-3 align-top text-right font-mono text-xs text-cyan-100">
                        {event.progress_percent}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
