import { ArrowUpRight, FileText } from 'lucide-react'
import type { ProposalViewModel } from './types'

export function FinalCta({ proposal }: { proposal: ProposalViewModel }) {
  return (
    <section id="download" className="relative w-full overflow-hidden py-28 lg:py-36">
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background: 'linear-gradient(180deg, #081218 0%, #0D1820 50%, #13232D 100%)',
        }}
      />
      <div className="absolute inset-0 -z-10 grid-bg-dark opacity-40" />
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(60% 60% at 80% 20%, rgba(245,185,66,0.12), transparent 60%), radial-gradient(50% 50% at 10% 80%, rgba(79,166,198,0.10), transparent 60%)',
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--border-strong)] to-transparent" />

      <div id="book" className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-end">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              09 - Next step
            </span>
            <h2 className="mt-4 max-w-xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              See your full solar proposal.
            </h2>
            <p className="mt-6 max-w-md text-base text-[color:var(--text-secondary)]">
              30-minute walkthrough with a project engineer. We review the model, the assumptions,
              and the financing path for {proposal.businessName}.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <a
              href="mailto:proposals@heliocap.energy"
              className="cta-gold group inline-flex w-full items-center justify-between gap-4 rounded-[18px] px-6 py-5 text-base font-semibold lg:w-auto"
            >
              <span>Book a Call</span>
              <ArrowUpRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <a
              href="#pdf"
              className="inline-flex w-full items-center justify-between gap-4 rounded-[18px] border border-[color:var(--border-strong)] bg-white/[0.04] px-6 py-5 text-base font-medium text-[color:var(--text-primary)] backdrop-blur-md transition-colors hover:bg-white/[0.08] lg:w-auto"
            >
              <span className="flex items-center gap-2.5">
                <FileText className="h-5 w-5" />
                Get Full Report PDF
              </span>
              <span className="font-mono text-xs text-[color:var(--text-muted)]">2.4 MB</span>
            </a>

            <div className="mt-4 flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
              <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[color:var(--success)]" />
              <span className="font-mono uppercase tracking-widest">
                Confidence / {proposal.confidence}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
