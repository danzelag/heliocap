import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Database, RadioTower, ShieldCheck, Sun, Target, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { ProspectPipelineTable } from '@/components/admin/ProspectPipelineTable'
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
    <div className="min-h-screen bg-[#07090c] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(30,41,59,0.75),transparent_32%),linear-gradient(135deg,#07090c_0%,#0d1117_52%,#050608_100%)]" />

      <nav className="relative z-10 border-b border-white/10 bg-[#090d12]/95 px-6 py-4 lg:px-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-10 w-10 place-items-center border border-white/15 bg-white/[0.03]">
              <ShieldCheck className="h-5 w-5 text-slate-200" />
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.36em] text-slate-500">OpenClaw</div>
              <div className="text-xl font-semibold tracking-[-0.04em] text-white">Pipeline Control</div>
            </div>
          </div>

          <Link href="/admin" className="inline-flex h-10 items-center justify-center gap-2 border border-white/10 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-white/25 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            Command Center
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin" className="inline-flex h-10 items-center justify-center border border-white/10 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-white/25 hover:text-white">
              Proposals
            </Link>
            <Link href="/admin/pipeline" className="inline-flex h-10 items-center justify-center border border-cyan-200/30 bg-cyan-200/10 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-100">
              Prospects
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 lg:px-10">
        <section className="border border-white/10 bg-[#0b1016]/90 p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-slate-500">Pipeline-first MVP</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">Build the boring machine first.</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Source buildings, fetch solar geometry, enrich owners, and publish proposal microsites. Video stays parked in v2 until replies prove the spend.
              </p>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Operator {user.email}
            </div>
          </div>

          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {stats.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="border border-white/10 bg-white/[0.025] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                    <Icon className={`h-3.5 w-3.5 ${item.tone}`} />
                  </div>
                  <div className="num text-xl font-semibold tracking-[-0.04em] text-white">{item.value}</div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {prospectStages.map((stage) => (
              <div key={stage} className="border border-white/10 bg-[#090d12] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {stage.replace('_', ' ')}
              </div>
            ))}
          </div>
        </section>

        <SourceLeadsForm />

        <ProspectPipelineTable initialProspects={prospects} />
      </main>
    </div>
  )
}
