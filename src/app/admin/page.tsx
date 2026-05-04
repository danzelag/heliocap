import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Activity, Clock3, Database, Plus, RadioTower, ShieldCheck, Sun, Target, Zap } from 'lucide-react'
import Link from 'next/link'
import { LeadTable } from '@/components/admin/LeadTable'
import { Lead } from '@/services/lead.service'

function formatCompactUSD(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(value)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function leadStatusClass(status: Lead['status']) {
  if (status === 'published') return 'border-emerald-300/25 text-emerald-200'
  if (status === 'contacted') return 'border-cyan-300/25 text-cyan-100'
  if (status === 'emailed') return 'border-blue-300/25 text-blue-100'
  if (status === 'replied') return 'border-amber-300/25 text-amber-100'
  if (status === 'booked') return 'border-roi/30 text-roi'
  return 'border-slate-500/30 text-slate-500'
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

  const leadRows = (leads as Lead[]) || []
  const prospectRows = (prospects as { pipeline_stage: string }[]) || []
  const publishedCount = leadRows.filter((lead) => lead.status === 'published').length
  const flaggedSavings = leadRows.reduce((total, lead) => total + (lead.estimated_savings || 0), 0)
  const liveRatio = leadRows.length ? Math.round((publishedCount / leadRows.length) * 100) : 0
  const recentActivity = leadRows.slice(0, 5)
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
    { label: 'Owner pierce', value: `${enrichedCount} enriched`, active: enrichedCount > 0 },
    { label: 'Microsite deploy', value: 'Vercel', active: publishedCount > 0 },
  ]

  return (
    <div className="min-h-screen bg-[#07090c] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(30,41,59,0.75),transparent_32%),linear-gradient(135deg,#07090c_0%,#0d1117_52%,#050608_100%)]" />

      <nav className="relative z-10 border-b border-white/10 bg-[#090d12]/95 px-6 py-4 lg:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-10 w-10 place-items-center border border-white/15 bg-white/[0.03]">
              <Sun className="h-5 w-5 text-slate-200" />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.36em] text-slate-500">Helio Cap</div>
              <div className="text-xl font-semibold tracking-[-0.04em] text-white">Command Center</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
              Operator {user.email}
            </div>
            <Link href="/admin">
              <Button variant="outline" className="h-10 rounded-none border-cyan-200/30 bg-cyan-200/10 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100 hover:bg-cyan-200/15">
                Proposals
              </Button>
            </Link>
            <Link href="/admin/pipeline">
              <Button variant="outline" className="h-10 rounded-none border-white/15 bg-transparent px-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-200 hover:bg-white/10">
                <RadioTower className="mr-2 h-4 w-4" />
                Prospects
              </Button>
            </Link>
            <Link href="/admin/leads/new">
              <Button className="h-10 rounded-none border border-white/15 bg-slate-100 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-950 hover:bg-white">
                <Plus className="mr-2 h-4 w-4" />
                New Target
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:px-10">
        <section className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="border border-white/10 bg-[#0b1016]/90 p-5 lg:p-6">
            <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.26em] text-slate-500">
                  <Activity className="h-4 w-4 text-slate-400" />
                  Activity board
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Live production queue</h1>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-500">
                System live ratio {liveRatio}%
              </div>
            </div>

            <div className="space-y-2">
              {recentActivity.length === 0 ? (
                <div className="border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-slate-500">
                  No proposal activity yet. New targets will appear here when they are created.
                </div>
              ) : (
                recentActivity.map((lead) => (
                  <div key={lead.id} className="grid gap-3 border border-white/10 bg-white/[0.025] p-4 md:grid-cols-[1fr_auto] md:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white">{lead.business_name}</span>
                        <span className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${leadStatusClass(lead.status)}`}>
                          {lead.status}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        /proposal/{lead.slug}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatTime(lead.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-white/10 bg-[#0b1016]/90 p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-slate-500">Status</div>
                  <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white">Signal Chain</h2>
                </div>
                <ShieldCheck className="h-5 w-5 text-slate-400" />
              </div>

              <div className="space-y-2">
                {workflow.map((step, index) => (
                  <div key={step.label} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-2 border border-white/10 bg-white/[0.02] p-2.5">
                    <div className="font-mono text-[10px] text-slate-500">{String(index + 1).padStart(2, '0')}</div>
                    <div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{step.label}</div>
                      <div className="text-xs text-slate-300">{step.value}</div>
                    </div>
                    <span className={`h-2 w-2 rounded-full ${step.active ? 'bg-emerald-300' : 'bg-slate-600'}`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {telemetry.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="border border-white/10 bg-[#0b1016]/90 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                      <Icon className={`h-3.5 w-3.5 ${item.tone}`} />
                    </div>
                    <div className="num text-xl font-semibold tracking-[-0.04em] text-white">{item.value}</div>
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
