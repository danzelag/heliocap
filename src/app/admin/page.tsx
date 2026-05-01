import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Activity, Database, Plus, RadioTower, ShieldCheck, Sun, Target, Zap } from 'lucide-react'
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

  const leadRows = (leads as Lead[]) || []
  const publishedCount = leadRows.filter((lead) => lead.status === 'published').length
  const draftCount = leadRows.filter((lead) => lead.status === 'draft').length
  const flaggedSavings = leadRows.reduce((total, lead) => total + (lead.estimated_savings || 0), 0)
  const liveRatio = leadRows.length ? Math.round((publishedCount / leadRows.length) * 100) : 0

  const telemetry = [
    { label: 'Targets indexed', value: leadRows.length.toLocaleString(), icon: Target, tone: 'text-cyan-300' },
    { label: 'Microsites live', value: publishedCount.toLocaleString(), icon: RadioTower, tone: 'text-emerald-300' },
    { label: 'Draft cells', value: draftCount.toLocaleString(), icon: Database, tone: 'text-amber-300' },
    { label: 'Annual savings flagged', value: formatCompactUSD(flaggedSavings), icon: Zap, tone: 'text-lime-300' },
  ]

  const workflow = [
    { label: 'Parcel intake', value: 'Regrid', active: true },
    { label: 'Solar geometry', value: 'Google Solar', active: true },
    { label: 'Owner pierce', value: 'OpenClaw', active: false },
    { label: 'Microsite deploy', value: 'Vercel', active: publishedCount > 0 },
  ]

  return (
    <div className="min-h-screen overflow-hidden bg-[#05070a] text-slate-100">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(21,94,117,0.34),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(22,163,74,0.18),transparent_28%),linear-gradient(135deg,#05070a_0%,#0b1117_48%,#020617_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px)] bg-[size:44px_44px]" />
        <div className="absolute left-[-10%] top-1/4 h-96 w-96 rounded-full border border-cyan-300/10" />
        <div className="absolute right-[-12%] top-10 h-[34rem] w-[34rem] rounded-full border border-emerald-300/10" />
      </div>

      <nav className="relative z-10 border-b border-cyan-200/10 bg-black/35 px-6 py-4 backdrop-blur-xl lg:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative grid h-11 w-11 place-items-center border border-cyan-300/30 bg-cyan-300/5 shadow-[0_0_38px_rgba(34,211,238,0.12)]">
              <div className="absolute inset-1 border border-cyan-300/15" />
              <Sun className="h-5 w-5 text-cyan-200" />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.42em] text-cyan-200/70">Helio Cap</div>
              <div className="text-xl font-semibold tracking-[-0.04em] text-white">Gotham Command Center</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-emerald-300/20 bg-emerald-300/5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.24em] text-emerald-200">
              Operator {user.email}
            </div>
            <Link href="/admin/leads/new">
              <Button className="h-10 rounded-none border border-cyan-200/30 bg-cyan-200/10 px-5 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.14)] hover:bg-cyan-200/20">
                <Plus className="mr-2 h-4 w-4" />
                New Target
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 lg:px-10">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden border border-cyan-200/10 bg-slate-950/55 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl lg:p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
            <div className="absolute right-6 top-6 font-mono text-[10px] uppercase tracking-[0.32em] text-slate-500">System live ratio {liveRatio}%</div>
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 border border-emerald-300/20 bg-emerald-300/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.26em] text-emerald-200">
                <Activity className="h-3.5 w-3.5" />
                Pipeline surveillance
              </div>
              <h1 className="text-balance text-5xl font-semibold leading-[0.95] tracking-[-0.06em] text-white md:text-6xl">
                Watch every solar prospect move through the machine.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-400">
                Built for the OpenClaw reroof workflow: parcel signals, roof intelligence, owner resolution, rendered proposals, and deployed microsites. This view stays operational for now, no extra automation buttons until the workflow is wired in.
              </p>
            </div>

            <div className="mt-8 grid gap-px overflow-hidden border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {telemetry.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="bg-[#071018]/95 p-5">
                    <div className="mb-6 flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.label}</span>
                      <Icon className={`h-4 w-4 ${item.tone}`} />
                    </div>
                    <div className="num text-3xl font-semibold tracking-[-0.04em] text-white">{item.value}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-200/70">Mission Stack</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">Reroof Signal Chain</h2>
              </div>
              <ShieldCheck className="h-6 w-6 text-emerald-300" />
            </div>

            <div className="space-y-3">
              {workflow.map((step, index) => (
                <div key={step.label} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border border-white/10 bg-white/[0.025] p-3">
                  <div className={`grid h-8 w-8 place-items-center border font-mono text-[10px] ${step.active ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200' : 'border-slate-600/50 bg-slate-900/70 text-slate-500'}`}>
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">{step.label}</div>
                    <div className="mt-1 text-sm text-slate-200">{step.value}</div>
                  </div>
                  <span className={`h-2 w-2 rounded-full ${step.active ? 'bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.7)]' : 'bg-slate-600'}`} />
                </div>
              ))}
            </div>

            <div className="mt-6 border border-cyan-200/10 bg-cyan-200/[0.03] p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-200/70">Current posture</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Command center is observing existing proposals only. n8n/OpenClaw can take over orchestration later without fighting the interface.
              </p>
            </div>
          </div>
        </section>

        <LeadTable initialLeads={leadRows} />
      </main>
    </div>
  )
}
