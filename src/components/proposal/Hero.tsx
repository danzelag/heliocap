import { ArrowRight, Download, Sparkles } from 'lucide-react'
import type { ProposalViewModel } from './types'

function formatUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function Hero({ proposal }: { proposal: ProposalViewModel }) {
  return (
    <section className="hero-aurora relative isolate min-h-[100svh] w-full overflow-hidden text-[color:var(--text-primary)]">
      {proposal.videoUrl ? (
        <>
          <video
            src={proposal.videoUrl}
            poster={proposal.heroImageUrl ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 -z-10 h-full w-full object-cover motion-reduce:hidden"
            aria-hidden="true"
          />
          {proposal.heroImageUrl ? (
            <img
              src={proposal.heroImageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 -z-10 h-full w-full object-cover motion-safe:hidden"
            />
          ) : null}
        </>
      ) : proposal.heroImageUrl ? (
        <img
          src={proposal.heroImageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
      ) : null}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,18,24,0.92) 0%, rgba(13,24,32,0.88) 45%, rgba(19,35,45,0.96) 100%)',
        }}
      />
      <div className="absolute inset-0 -z-10 grid-bg-dark opacity-50" aria-hidden="true" />
      <div
        className="absolute inset-x-0 bottom-0 -z-10 h-48"
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

      <div className="mx-auto flex max-w-7xl flex-col items-start px-6 pb-32 pt-12 lg:px-10 lg:pb-44 lg:pt-24">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[color:var(--border-strong)] bg-white/[0.03] px-3.5 py-1.5 text-xs text-[color:var(--text-secondary)] backdrop-blur-md">
          <Sparkles className="h-3 w-3 text-[color:var(--solar-gold)]" strokeWidth={2} />
          <span className="font-mono uppercase tracking-widest">
            Personalized for {proposal.businessName}
          </span>
        </div>

        <h1 className="animate-fade-up stagger-1 mt-8 max-w-5xl text-balance text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl lg:text-[5.5rem]">
          Your building could save{' '}
          <span className="num text-[color:var(--solar-gold)]">
            {formatUSD(proposal.annualSavings)}
          </span>{' '}
          <span className="text-[color:var(--text-secondary)]">annually with solar.</span>
        </h1>

        <p className="animate-fade-up stagger-2 mt-8 max-w-2xl text-lg text-[color:var(--text-secondary)] md:text-xl">
          Modeled for your property at{' '}
          <span className="text-[color:var(--text-primary)]">{proposal.address}</span> - verified
          roof geometry, local irradiance, and your current utility tariff.
        </p>

        <div className="animate-fade-up stagger-3 mt-10 flex flex-wrap items-center gap-3">
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

        <div className="animate-fade-up stagger-4 mt-12 inline-flex items-center gap-3 rounded-2xl border border-[color:var(--border-soft)] bg-white/[0.03] px-4 py-3 text-xs text-[color:var(--text-secondary)] backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[color:var(--success)]" />
            <span className="font-mono uppercase tracking-widest text-[color:var(--text-primary)]">
              Confidence / {proposal.confidence}
            </span>
          </div>
          <span className="h-3 w-px bg-[color:var(--border-strong)]" />
          <span>{proposal.confidenceBasis}</span>
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
