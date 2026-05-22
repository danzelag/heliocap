import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Clock3, Database, ListChecks, RadioTower, ShieldCheck, Sun, Target, Zap } from 'lucide-react'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import { createClient } from '@/lib/supabase-server'
import { ProspectPipelineTable } from '@/components/admin/ProspectPipelineTable'
import { ProposalJobsQueue, type ProposalJob, type ProposalJobEvent } from '@/components/admin/ProposalJobsQueue'
import { SourceLeadsForm } from '@/components/admin/SourceLeadsForm'
import { ProspectService } from '@/services/prospect.service'

function formatCompactUSD(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(value)
}

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

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
  const solarFetched = prospects.filter((prospect) => prospect.pipeline_stage === 'solar_fetched').length
  const notQualified = prospects.filter((prospect) => prospect.pipeline_stage === 'dead').length
  const coordinateReview = prospects.filter((prospect) => (
    prospect.pipeline_stage === 'coordinate_review' || prospect.needs_review
  )).length
  const proposalTargets = prospects.filter((prospect) => (
    prospect.pipeline_stage === 'microsite_live' || prospect.lead_id || prospect.microsite_slug
  )).length
  const activeJobs = jobRows.filter((job) => job.status === 'queued' || job.status === 'running').length
  const completedJobs = jobRows.filter((job) => job.status === 'completed').length
  const activeProspects = prospects.length - notQualified - proposalTargets
  const flaggedItc = prospects.reduce((total, prospect) => total + (prospect.federal_itc || 0), 0)

  const stats = [
    { label: 'Active', value: activeProspects.toLocaleString(), icon: Target, tone: 'text-slate-200' },
    { label: 'Solar ready', value: solarFetched.toLocaleString(), icon: Sun, tone: 'text-stone-200' },
    { label: 'In build', value: activeJobs.toLocaleString(), icon: Clock3, tone: 'text-amber-200' },
    { label: 'Proposals', value: proposalTargets.toLocaleString(), icon: RadioTower, tone: 'text-emerald-200' },
    { label: 'ITC', value: formatCompactUSD(flaggedItc), icon: Zap, tone: 'text-slate-200' },
  ]
  const workflow = [
    {
      label: 'Intake',
      detail: 'homeowner records',
      value: prospects.length.toLocaleString(),
      active: prospects.length > 0,
      icon: Database,
    },
    {
      label: 'Roof lock',
      detail: coordinateReview > 0 ? 'needs review' : 'coordinates clear',
      value: coordinateReview.toLocaleString(),
      active: coordinateReview === 0 && prospects.length > 0,
      icon: ShieldCheck,
    },
    {
      label: 'Solar data',
      detail: 'ready for proposal',
      value: solarFetched.toLocaleString(),
      active: solarFetched > 0,
      icon: Sun,
    },
    {
      label: 'Build',
      detail: 'live app workflow',
      value: activeJobs.toLocaleString(),
      active: activeJobs > 0,
      icon: ListChecks,
    },
    {
      label: 'Published',
      detail: `${completedJobs} recent jobs`,
      value: proposalTargets.toLocaleString(),
      active: proposalTargets > 0,
      icon: CheckCircle2,
    },
  ]

  return (
    <div className="admin-shell">
      <AdminRoutePrefetcher />

      <nav className="admin-nav sticky top-0 z-20 border-b border-[#30343b] bg-[#121417] px-4 py-3 shadow-none lg:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="admin-brand-mark grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#343a42] bg-[#202329] text-[#d99a3d]">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="admin-eyebrow">Helio Cap</div>
              <div className="admin-title">Generator</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin" prefetch className="admin-nav-pill inline-flex items-center gap-2 rounded-md border border-[#30343b] bg-[#181a1f] px-3 py-2 text-sm font-semibold text-[#c9d0d6]">
              <ArrowLeft className="h-3.5 w-3.5" />
              Proposals
            </Link>
            <Link href="/admin/pipeline" prefetch className="admin-nav-pill admin-nav-pill-active inline-flex items-center rounded-md border border-[#7a5a37] bg-[#24262b] px-3 py-2 text-sm font-semibold text-[#e4ad62]">
              Prospects
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 overflow-x-hidden px-3 py-4 sm:px-4 lg:px-5">
        <section className="admin-workspace-hero min-w-0 overflow-hidden rounded-lg border border-[#30343b] bg-[#181a1f] p-4 shadow-[0_16px_38px_rgba(0,0,0,0.22)] lg:p-5">
          <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="admin-eyebrow">Proposal generator</div>
              <h1 className="mt-2 text-2xl font-semibold text-stone-50 lg:text-3xl">Control centre</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                Verify roof targets, inspect Google Solar imagery, generate black-panel renders, and publish proposal pages from one fitted workspace.
              </p>
            </div>
            <div className="admin-chip max-w-full truncate px-3 py-2 text-sm">
              {user.email}
            </div>
          </div>

          <div className="admin-workflow-strip mt-5 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {workflow.map((step, index) => {
              const Icon = step.icon
              return (
                <div
                  key={step.label}
                  className={`admin-workflow-step min-w-0 overflow-hidden rounded-lg border p-3 ${
                    step.active
                      ? 'admin-workflow-step-active border-[#7a5a37] bg-[#24262b] text-[#f4dfc7]'
                      : 'border-[#30343b] bg-[#202329] text-[#9aa3ad]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="admin-step-icon grid h-8 w-8 shrink-0 place-items-center rounded-md border border-[#343a42] bg-[#181a1f] text-[#d99a3d]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="num text-lg font-semibold">{step.value}</div>
                  </div>
                  <div className="mt-3 text-sm font-semibold text-stone-100">{String(index + 1).padStart(2, '0')} · {step.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{step.detail}</div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {stats.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="admin-metric-tile min-w-0 rounded-lg border border-[#30343b] bg-[#15171b] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">{item.label}</span>
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="num text-2xl font-semibold text-stone-50">{item.value}</div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,480px)]">
          <SourceLeadsForm />
          <ProposalJobsQueue
            initialJobs={jobRows}
            initialEvents={jobEventRows}
          />
        </section>

        <ProspectPipelineTable initialProspects={prospects} />
      </main>
    </div>
  )
}
