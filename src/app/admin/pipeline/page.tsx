import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Database, RadioTower, ShieldCheck, Sun, Target, Zap } from 'lucide-react'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'
import { createClient } from '@/lib/supabase-server'
import { ProspectPipelineTable } from '@/components/admin/ProspectPipelineTable'
import { ProposalJobsQueue, type ProposalJob, type ProposalJobEvent } from '@/components/admin/ProposalJobsQueue'
import { SourceLeadsForm } from '@/components/admin/SourceLeadsForm'
import { prospectStages } from '@/lib/prospect'
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

  const solarFetched = prospects.filter((prospect) => prospect.pipeline_stage === 'solar_fetched').length
  const enriched = prospects.filter((prospect) => prospect.pipeline_stage === 'enriched').length
  const live = prospects.filter((prospect) => prospect.pipeline_stage === 'microsite_live').length
  const flaggedItc = prospects.reduce((total, prospect) => total + (prospect.federal_itc || 0), 0)

  const stats = [
    { label: 'Prospects', value: prospects.length.toLocaleString(), icon: Target, tone: 'text-slate-200' },
    { label: 'Solar Ready', value: solarFetched.toLocaleString(), icon: Sun, tone: 'text-cyan-200' },
    { label: 'Enriched', value: enriched.toLocaleString(), icon: Database, tone: 'text-amber-200' },
    { label: 'Live', value: live.toLocaleString(), icon: RadioTower, tone: 'text-emerald-200' },
    { label: 'ITC Flagged', value: formatCompactUSD(flaggedItc), icon: Zap, tone: 'text-slate-200' },
  ]

  return (
    <div className="admin-shell">
      <AdminRoutePrefetcher />

      <nav className="admin-nav sticky top-0 z-20 px-5 py-3 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="admin-brand-mark h-10 w-10">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="admin-eyebrow">Helio Cap</div>
              <div className="admin-title">Prospects</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <AdminThemeToggle />
            <Link href="/admin" prefetch className="admin-nav-pill">
              <ArrowLeft className="h-3.5 w-3.5" />
              Proposals
            </Link>
            <Link href="/admin/pipeline" prefetch className="admin-nav-pill admin-nav-pill-active">
              Prospects
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 lg:px-8">
        <section className="admin-panel p-4 lg:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="admin-eyebrow">Prospect pipeline</div>
              <h1 className="mt-1 text-2xl font-semibold text-stone-50">Prospects</h1>
            </div>
            <div className="admin-chip px-3 py-2 text-sm">
              {user.email}
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="admin-panel-muted p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">{item.label}</span>
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  <div className="num text-xl font-semibold text-stone-50">{item.value}</div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {prospectStages.map((stage) => (
              <div key={stage} className="admin-chip px-3 py-2">
                {stage.replace('_', ' ')}
              </div>
            ))}
          </div>
        </section>

        <SourceLeadsForm />

        <ProposalJobsQueue
          initialJobs={(jobs as ProposalJob[]) || []}
          initialEvents={(jobEvents as ProposalJobEvent[]) || []}
        />

        <ProspectPipelineTable initialProspects={prospects} />
      </main>
    </div>
  )
}
