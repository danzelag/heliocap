import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Plus, RadioTower, Search, Sun } from 'lucide-react'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import { createClient } from '@/lib/supabase-server'
import { ProspectPipelineTable } from '@/components/admin/ProspectPipelineTable'
import { ProposalJobsQueue, type ProposalJob, type ProposalJobEvent } from '@/components/admin/ProposalJobsQueue'
import { ProspectService } from '@/services/prospect.service'

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const prospects = await ProspectService.listProspects()

  const { data: jobs } = await supabase
    .from('proposal_jobs')
    .select('id, business_name, address, slug, status, current_step, progress_percent, proposal_url, error_message, receipt, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(24)

  const { data: jobEvents } = await supabase
    .from('proposal_job_events')
    .select('id, job_id, business_name, status, step, progress_percent, proposal_url, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const jobRows = (jobs as ProposalJob[]) || []
  const jobEventRows = (jobEvents as ProposalJobEvent[]) || []

  const notQualified = prospects.filter((p) => p.pipeline_stage === 'dead').length
  const coordinateReview = prospects.filter((p) => p.pipeline_stage === 'coordinate_review' || p.needs_review).length
  const solarFetched = prospects.filter((p) => p.pipeline_stage === 'solar_fetched').length
  const proposalTargets = prospects.filter((p) => p.pipeline_stage === 'microsite_live' || p.lead_id || p.microsite_slug).length
  const activeJobs = jobRows.filter((j) => j.status === 'queued' || j.status === 'running').length
  const activeProspects = prospects.length - notQualified - proposalTargets

  const failedJobs = jobRows.filter((j) => j.status === 'failed').length
  const liveJobs = jobRows.filter((j) => j.status === 'completed').length

  const pipelineStages = [
    { label: 'Intake', value: prospects.length, sub: 'records', bar: Math.min(100, prospects.length * 5), tone: '#e8e4dc' },
    { label: 'Active', value: activeProspects, sub: 'in pipeline', bar: Math.min(100, activeProspects * 8), tone: '#e8e4dc' },
    { label: 'Roof review', value: coordinateReview, sub: coordinateReview ? 'needs eyes' : 'clear', bar: coordinateReview ? 78 : 12, tone: coordinateReview ? '#d99a3d' : '#8eb98c', tag: coordinateReview ? 'review' : undefined },
    { label: 'Solar ready', value: solarFetched, sub: 'data ready', bar: Math.min(100, solarFetched * 12), tone: '#cdb592' },
    { label: 'Building', value: activeJobs, sub: activeJobs ? 'jobs live' : 'idle', bar: activeJobs ? 65 : 6, tone: activeJobs ? '#d99a3d' : '#7c8694', tag: activeJobs ? 'live' : undefined },
    { label: 'Proposals', value: proposalTargets, sub: `${liveJobs} recent`, bar: Math.min(100, Math.max(14, proposalTargets * 6)), tone: '#8eb98c' },
  ]

  return (
    <div
      className="min-h-screen bg-[#15171c]"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif', color: '#e8e4dc' }}
    >
      <AdminRoutePrefetcher />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-20 border-b border-[#2a2e36] bg-[#1c1e24]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#2e2519] bg-[#15120b] text-[#d99a3d]">
              <Sun className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">HelioCap</div>
              <div className="text-[14px] font-bold leading-tight text-[#e0ddd8]">Command Centre</div>
            </div>
            <div className="ml-2 hidden h-8 items-center gap-2 rounded-md border border-[#2a2e36] bg-[#1f2229] px-2.5 lg:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[#7ba87a]" />
              <span className="font-mono text-[10.5px] text-[#a8b1bb]">solar-api · supabase · workflow</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden h-8 items-center gap-2 rounded-md border border-[#2a2e36] bg-[#1f2229] px-3 md:flex">
              <Search className="h-3.5 w-3.5 text-[#5c6672]" />
              <span className="w-56 text-[12px] text-[#5c6672]">Search prospects, jobs, slugs...</span>
              <span className="rounded border border-[#2a2e36] px-1.5 font-mono text-[9.5px] text-[#5c6672]">⌘K</span>
            </div>
            <Link
              href="/admin"
              prefetch
              className="rounded-md border border-[#2a2e36] bg-transparent px-3 py-2 text-xs font-semibold text-[#a8b1bb] transition-colors hover:border-[#363c45] hover:text-[#e8e4dc]"
            >
              Proposals
            </Link>
            <Link
              href="/admin/pipeline"
              prefetch
              className="rounded-md border border-[#3a2f1e] bg-[#19140c] px-3 py-2 text-xs font-semibold text-[#d99a3d]"
            >
              <RadioTower className="mr-1.5 inline h-3.5 w-3.5" />
              Pipeline
            </Link>
            <Link
              href="/admin/leads/new"
              prefetch
              className="inline-flex items-center gap-1.5 rounded-md bg-[#d99a3d] px-3 py-2 text-xs font-bold text-[#1a0e00] transition-colors hover:bg-[#e6a845]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Lead
            </Link>
            <div className="hidden max-w-[220px] truncate rounded-md border border-[#2a2e36] bg-[#1f2229] px-3 py-2 font-mono text-[10.5px] text-[#a8b1bb] md:block">
              {user.email}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1600px] space-y-5 px-5 py-5">

        {/* Pipeline stage strip */}
        <div className="grid overflow-hidden rounded-lg border border-[#2a2e36] bg-[#1f2229] sm:grid-cols-2 lg:grid-cols-6">
          {pipelineStages.map((stage, i) => (
            <div key={stage.label} className={`px-4 py-3 ${i > 0 ? 'border-t border-[#272a31] sm:border-l sm:border-t-0' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#5c6672]">{stage.label}</span>
                {stage.tag && (
                  <span className="rounded bg-[#15120b] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#d99a3d]">
                    {stage.tag}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-mono text-[26px] font-light leading-none tabular-nums" style={{ color: stage.tone }}>
                  {stage.value}
                </span>
                <span className="text-[10.5px] text-[#5c6672]">{stage.sub}</span>
              </div>
              <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-[#272a31]">
                <div className="h-full" style={{ width: `${stage.bar}%`, background: stage.tone }} />
              </div>
            </div>
          ))}
        </div>

        {failedJobs > 0 && (
          <div className="rounded-lg border border-[#3a2521] bg-[#241814] px-4 py-3 text-[12px] text-[#d77c70]">
            {failedJobs} proposal job{failedJobs === 1 ? '' : 's'} need review in the queue rail.
          </div>
        )}

        {/* Queue */}
        <ProposalJobsQueue initialJobs={jobRows} initialEvents={jobEventRows} />

        {/* Prospect table */}
        <ProspectPipelineTable initialProspects={prospects} />
      </main>
    </div>
  )
}
