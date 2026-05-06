import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Database, Plus, RadioTower, ShieldCheck, Sun, Target, Zap } from 'lucide-react'
import Link from 'next/link'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import { LeadTable } from '@/components/admin/LeadTable'
import { ProposalJobsQueue, type ProposalJob, type ProposalJobEvent } from '@/components/admin/ProposalJobsQueue'
import { Lead } from '@/services/lead.service'

function formatCompactUSD(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(value)
}

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: prospects } = await supabase
    .from('prospects')
    .select('pipeline_stage')

  const { data: jobs } = await supabase
    .from('proposal_jobs')
    .select('id, business_name, address, slug, status, current_step, progress_percent, proposal_url, error_message, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(12)

  const { data: jobEvents } = await supabase
    .from('proposal_job_events')
    .select('id, job_id, business_name, status, step, progress_percent, proposal_url, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const leadRows = (leads as Lead[]) || []
  const prospectRows = (prospects as { pipeline_stage: string }[]) || []
  const jobRows = (jobs as ProposalJob[]) || []
  const jobEventRows = (jobEvents as ProposalJobEvent[]) || []
  const publishedCount = leadRows.filter((lead) => lead.status === 'published').length
  const flaggedSavings = leadRows.reduce((total, lead) => total + (lead.estimated_savings || 0), 0)
  const solarFetchedCount = prospectRows.filter((prospect) => prospect.pipeline_stage === 'solar_fetched').length
  const enrichedCount = prospectRows.filter((prospect) => prospect.pipeline_stage === 'enriched').length

  const telemetry = [
    { label: 'Targets', value: (leadRows.length + prospectRows.length).toLocaleString(), icon: Target, tone: 'text-slate-200' },
    { label: 'Live', value: publishedCount.toLocaleString(), icon: RadioTower, tone: 'text-emerald-300' },
    { label: 'Pipeline', value: prospectRows.length.toLocaleString(), icon: Database, tone: 'text-amber-300' },
    { label: 'Savings', value: formatCompactUSD(flaggedSavings), icon: Zap, tone: 'text-slate-200' },
  ]

  const workflow = [
    { label: 'Parcel intake', value: `${prospectRows.length} sourced`, active: prospectRows.length > 0 },
    { label: 'Solar geometry', value: `${solarFetchedCount} ready`, active: solarFetchedCount > 0 },
    { label: 'Owner data', value: `${enrichedCount} enriched`, active: enrichedCount > 0 },
    { label: 'Published', value: `${publishedCount} live`, active: publishedCount > 0 },
  ]

  return (
    <div className="admin-shell">
      <AdminRoutePrefetcher />

      <nav className="admin-nav sticky top-0 z-20 px-5 py-3 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-emerald-900/60 bg-emerald-950/25">
              <Sun className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <div className="admin-eyebrow">Helio Cap</div>
              <div className="admin-title">Admin</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden rounded-full border border-stone-700/70 bg-stone-950/70 px-3 py-2 text-sm text-slate-500 md:block">
              {user.email}
            </div>
            <Link href="/admin" prefetch>
              <Button variant="outline" className="h-10 rounded-lg border-amber-300/70 bg-emerald-950/25 px-4 text-sm font-semibold text-emerald-300 hover:bg-emerald-950/40">
                Proposals
              </Button>
            </Link>
            <Link href="/admin/pipeline" prefetch>
              <Button variant="outline" className="h-10 rounded-lg border-stone-700/70 bg-stone-950/70 px-4 text-sm font-semibold text-stone-300 hover:bg-stone-900/60">
                <RadioTower className="mr-2 h-4 w-4" />
                Prospects
              </Button>
            </Link>
            <Link href="/admin/leads/new" prefetch>
              <Button className="h-10 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-stone-950 hover:bg-amber-200">
                <Plus className="mr-2 h-4 w-4" />
                New proposal
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-6 lg:px-8">
        <section className="grid gap-5 lg:grid-cols-[1fr_19rem]">
          <ProposalJobsQueue initialJobs={jobRows} initialEvents={jobEventRows} />

          <div className="space-y-3">
            <div className="admin-panel p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="admin-eyebrow">Status</div>
                  <h2 className="mt-1 text-lg font-semibold text-stone-50">Pipeline</h2>
                </div>
                <ShieldCheck className="h-5 w-5 text-slate-400" />
              </div>

              <div className="space-y-2">
                {workflow.map((step, index) => (
                  <div key={step.label} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 rounded-lg border border-stone-700/70 bg-stone-900/60 p-2.5">
                    <div className="text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, '0')}</div>
                    <div>
                      <div className="text-xs font-semibold text-stone-400">{step.label}</div>
                      <div className="text-xs text-slate-500">{step.value}</div>
                    </div>
                    <span className={`h-2 w-2 rounded-full ${step.active ? 'bg-emerald-400' : 'bg-stone-600'}`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {telemetry.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="admin-panel p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-500">{item.label}</span>
                      <Icon className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <div className="num text-xl font-semibold text-stone-50">{item.value}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <LeadTable initialLeads={leadRows} />
      </main>
    </div>
  )
}
