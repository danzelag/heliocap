import { ChevronLeft, FilePlus2 } from 'lucide-react'
import Link from 'next/link'
import LeadGeneratorForm from './LeadGeneratorForm'

export default function NewLeadPage() {
  return (
    <div className="min-h-screen bg-[#07090c] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(30,41,59,0.65),transparent_30%),linear-gradient(135deg,#07090c_0%,#0d1117_55%,#050608_100%)]" />

      <nav className="relative z-10 border-b border-white/10 bg-[#090d12]/95 px-6 py-4 lg:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="grid h-9 w-9 place-items-center border border-white/10 text-slate-400 transition-colors hover:border-white/25 hover:text-white">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-slate-500">Command Center</div>
              <div className="text-lg font-semibold tracking-[-0.03em] text-white">Generate Outreach Portfolio</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:flex">
            <FilePlus2 className="h-3.5 w-3.5 text-slate-400" />
            New dossier
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-8 lg:px-10">
        <div className="mb-6 border border-white/10 bg-[#0b1016]/90 p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">Portfolio intake</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-white">Create a proposal target</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Assemble the site record, imagery, and economics required to publish a client-facing proposal page.
          </p>
        </div>

        <LeadGeneratorForm />
      </main>
    </div>
  )
}
