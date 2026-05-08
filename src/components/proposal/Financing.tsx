'use client'

import { useState } from 'react'
import { Banknote, Building2, CreditCard } from 'lucide-react'
import type { ProposalViewModel } from './types'

function fmtUSD(n: number, max = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: max,
  }).format(n)
}

type Path = 'ppa' | 'loan' | 'cash'

const paths: Record<
  Path,
  {
    title: string
    short: string
    icon: typeof CreditCard
    headline: (proposal: ProposalViewModel) => string
    subhead: (proposal: ProposalViewModel) => string
    bullets: (proposal: ProposalViewModel) => string[]
  }
> = {
  ppa: {
    title: 'Power Purchase Agreement',
    short: 'PPA',
    icon: Building2,
    headline: (proposal) => `${fmtUSD(Math.max(proposal.utilityRate * 0.66, 0.06), 3)} / kWh`,
    subhead: () => 'Locked rate / 25 yrs',
    bullets: (proposal) => [
      '$0 upfront capital',
      `Day-one savings vs. ${fmtUSD(proposal.utilityRate, 2)}/kWh utility blend`,
      'Helio Cap owns + maintains the asset',
      `Estimated Year 1 net: ${fmtUSD(proposal.annualSavings * 0.62)}`,
    ],
  },
  loan: {
    title: 'Capital Loan',
    short: 'Loan',
    icon: CreditCard,
    headline: (proposal) => fmtUSD(proposal.financing.monthly_payment),
    subhead: (proposal) => `${proposal.financing.term_years} yr / ${proposal.financing.apr}% APR`,
    bullets: (proposal) => [
      `${proposal.financing.lender}`,
      'Tax credits + depreciation accrue to you',
      'Cash-flow positive from month one',
      `Structured against ${proposal.financing.term_years}-year amortization`,
    ],
  },
  cash: {
    title: 'Cash Purchase',
    short: 'Cash',
    icon: Banknote,
    headline: (proposal) => `${proposal.paybackPeriod.toFixed(1)} yrs`,
    subhead: () => 'Payback period',
    bullets: (proposal) => [
      'Highest 25-year IRR',
      'Full retention of ITC + MACRS',
      `Lifetime savings: ${fmtUSD(proposal.twentyYearSavings)}`,
      'Asset depreciates on your books',
    ],
  },
}

export function Financing({ proposal }: { proposal: ProposalViewModel }) {
  const [active, setActive] = useState<Path>('loan')
  const config = paths[active]

  return (
    <section className="w-full py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-14 max-w-3xl">
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
            06 - Financing
          </span>
          <h2 className="mt-3 text-balance text-4xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl">
            Three paths. One asset. You choose.
          </h2>
          <p className="mt-5 max-w-xl text-base text-[color:var(--text-secondary)]">
            {proposal.financing.structure}. Switch between structures to see how each shapes monthly
            cost, ownership, and long-term return.
          </p>
        </div>

        <div className="mb-6 inline-flex rounded-2xl border border-[color:var(--border-soft)] bg-white/[0.03] p-1 backdrop-blur-md">
          {(Object.keys(paths) as Path[]).map((key) => {
            const isActive = key === active
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                className={`relative rounded-xl px-3 py-2 text-sm font-medium transition-colors md:px-4 ${
                  isActive
                    ? 'text-[#1A0F00]'
                    : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
                }`}
                style={
                  isActive
                    ? {
                        background: 'linear-gradient(135deg, #F5B942 0%, #D99028 100%)',
                        boxShadow:
                          '0 4px 12px rgba(245,185,66,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
                      }
                    : {}
                }
              >
                <span className="md:hidden">{paths[key].short}</span>
                <span className="hidden md:inline">{paths[key].title}</span>
              </button>
            )
          })}
        </div>

        <div className="glass-strong card-lift grid gap-10 rounded-3xl p-8 lg:grid-cols-5 lg:p-12">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <config.icon className="h-5 w-5 text-[color:var(--cyan-soft)]" strokeWidth={1.6} />
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                {config.subhead(proposal)}
              </span>
            </div>
            <div className="num mt-6 text-6xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-7xl">
              {config.headline(proposal)}
            </div>
            <p className="mt-4 text-sm text-[color:var(--text-muted)]">{config.title}</p>
          </div>

          <ul className="space-y-4 lg:col-span-3">
            {config.bullets(proposal).map((bullet, index) => (
              <li
                key={`${active}-${index}`}
                className="animate-fade-up flex items-start gap-3 text-sm text-[color:var(--text-secondary)] md:text-base"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <span className="mt-[7px] inline-flex h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--border-strong)]" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
