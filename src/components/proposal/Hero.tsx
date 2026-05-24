import { ArrowRight, Download, Sparkles } from 'lucide-react'
import type { ProposalViewModel } from './types'
import { RoofVisual } from './RoofVisual'

function formatCAD(n: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function Hero({ proposal }: { proposal: ProposalViewModel }) {
  return (
    <section className="relative isolate min-h-[100svh] w-full overflow-hidden bg-[color:var(--background)] text-[color:var(--text-primary)]">
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(circle at 20% 12%, rgba(245,185,66,0.12), transparent 34%), linear-gradient(180deg, #081218 0%, #0f1b23 52%, #081218 100%)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 -z-10 h-56"
        aria-hidden="true"
        style={{ background: 'linear-gradient(180deg, transparent 0%, #081218 100%)' }}
      />

      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-10">
        <div className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-[10px]"
            style={{ background: 'linear-gradient(135deg, #F5B942 0%, #D99028 100%)' }}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold tracking-tight">Helio Cap</span>
        </div>
        <div className="hidden items-center gap-3 text-xs text-[color:var(--text-muted)] md:flex">
          <span className="font-mono uppercase tracking-widest">
            Proposal / {new Date().getFullYear()}
          </span>
          <span className="h-1 w-1 rounded-full bg-[color:var(--text-muted)]/60" />
          <span className="font-mono">
            Ref #HX-{proposal.systemSize}-{proposal.paybackPeriod.toString().replace('.', '')}
          </span>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 pb-28 pt-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] lg:px-10 lg:pb-32 lg:pt-14">
        <div className="animate-fade-up order-2 lg:order-1">
          <div className="relative overflow-hidden rounded-[28px] border border-[color:var(--border-strong)] bg-black shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
            <div className="aspect-[16/10] w-full bg-[#0B0E10]">
              {proposal.heroImageUrl ? (
                <img
                  src={proposal.heroImageUrl}
                  alt={`Aerial solar proposal preview for ${proposal.businessName}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <RoofVisual systemSizeKw={proposal.systemSize} />
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 text-sm text-[color:var(--text-secondary)] sm:grid-cols-3">
            <div className="glass-soft rounded-2xl px-4 py-3">
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                System
              </span>
              <span className="mt-1 block text-base font-semibold text-[color:var(--text-primary)]">
                {proposal.systemSize} kW
              </span>
            </div>
            <div className="glass-soft rounded-2xl px-4 py-3">
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                Payback
              </span>
              <span className="mt-1 block text-base font-semibold text-[color:var(--text-primary)]">
                {proposal.paybackPeriod.toFixed(1)} yrs
              </span>
            </div>
            <div className="glass-soft rounded-2xl px-4 py-3">
              <span className="block font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                Confidence
              </span>
              <span className="mt-1 block text-base font-semibold text-[color:var(--text-primary)]">
                {proposal.confidence}
              </span>
            </div>
          </div>
        </div>

        <div className="order-1 flex flex-col items-start lg:order-2">
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-white/[0.04] px-3.5 py-1.5 text-xs text-[color:var(--text-secondary)] backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--solar-gold)]" strokeWidth={2} />
            <span className="font-mono uppercase tracking-widest">
              Personalized for {proposal.businessName}
            </span>
          </div>

          <h1 className="animate-fade-up stagger-1 mt-7 max-w-3xl text-balance text-5xl font-semibold leading-[1.02] tracking-tight md:text-6xl xl:text-7xl">
            Solar layout for your property.
          </h1>

          <p className="animate-fade-up stagger-2 mt-6 max-w-xl text-lg text-[color:var(--text-secondary)] md:text-xl">
            A still preview of{' '}
            <span className="text-[color:var(--text-primary)]">{proposal.address}</span> with the
            proposed black-panel rooftop array placed from available Solar API roof data.
          </p>

          <div className="animate-fade-up stagger-3 mt-8 rounded-[24px] border border-[color:var(--border-soft)] bg-white/[0.035] p-5 backdrop-blur-md">
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              Estimated annual savings
            </span>
            <div className="num mt-2 text-5xl font-semibold tracking-tight text-[color:var(--solar-gold)] md:text-6xl">
              {formatCAD(proposal.annualSavings)}
            </div>
            <p className="mt-3 text-sm text-[color:var(--text-secondary)]">
              {proposal.confidenceBasis}
            </p>
          </div>

          <div className="animate-fade-up stagger-4 mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#savings"
              className="cta-gold group inline-flex items-center gap-2 rounded-[18px] px-6 py-4 text-sm font-semibold"
            >
              View Full Savings Breakdown
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#download"
              className="inline-flex items-center gap-2 rounded-[18px] border border-[color:var(--border-strong)] bg-white/[0.04] px-6 py-4 text-sm font-medium text-[color:var(--text-primary)] backdrop-blur-md transition-colors hover:bg-white/[0.08]"
            >
              <Download className="h-4 w-4" />
              Download Proposal
            </a>
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-[color:var(--text-muted)]">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Scroll</span>
        <div className="relative h-10 w-px overflow-hidden bg-[color:var(--border-strong)]">
          <div className="absolute inset-x-0 top-0 h-3 animate-scroll-hint bg-[color:var(--solar-gold)]" />
        </div>
      </div>
    </section>
  )
}
