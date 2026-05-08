import { Clock, TrendingUp, Wallet, Zap } from 'lucide-react'
import type { ProposalViewModel } from './types'

function fmtUSD(n: number, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    ...opts,
  }).format(n)
}

export function SavingsSnapshot({ proposal }: { proposal: ProposalViewModel }) {
  const metrics = [
    {
      label: 'Annual Savings',
      value: fmtUSD(proposal.annualSavings),
      sub: 'Year 1 net of O&M',
      accent: true,
      icon: TrendingUp,
    },
    {
      label: '20-Year Savings',
      value: fmtUSD(proposal.twentyYearSavings),
      sub: 'Lifetime cumulative',
      icon: Wallet,
    },
    {
      label: 'Payback Period',
      value: `${proposal.paybackPeriod.toFixed(1)} yrs`,
      sub: 'After incentives',
      icon: Clock,
    },
    {
      label: 'System Size',
      value: `${proposal.systemSize} kW`,
      sub: 'DC nameplate',
      icon: Zap,
    },
  ]

  return (
    <section id="savings" className="relative w-full py-24 lg:py-32">
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background: 'linear-gradient(180deg, #081218 0%, #0D1820 50%, #081218 100%)',
        }}
      />
      <div className="absolute inset-0 -z-10 grid-bg-dark opacity-30" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[color:var(--border-strong)] to-transparent" />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-14 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              02 - Financial Snapshot
            </span>
            <h2 className="mt-3 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl">
              The numbers, modeled for your meter.
            </h2>
          </div>
          <p className="max-w-md text-sm text-[color:var(--text-secondary)]">
            Calculated from your average monthly bill of {fmtUSD(proposal.monthlyBill)}, current
            utility escalation of 3.8%, and a 25-year production warranty.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <article
              key={metric.label}
              className="glass card-lift animate-fade-up group relative rounded-3xl p-7 lg:p-8"
              style={{ animationDelay: `${(index + 1) * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  {String(index + 1).padStart(2, '0')} / {metric.label}
                </span>
                <metric.icon
                  className={`h-4 w-4 ${
                    metric.accent
                      ? 'text-[color:var(--solar-gold)]'
                      : 'text-[color:var(--text-muted)]'
                  }`}
                  strokeWidth={1.6}
                />
              </div>

              <div
                className={`num mt-7 text-4xl font-semibold tracking-tight md:text-5xl ${
                  metric.accent
                    ? 'text-[color:var(--solar-gold)]'
                    : 'text-[color:var(--text-primary)]'
                }`}
              >
                {metric.value}
              </div>
              <div className="mt-3 text-xs text-[color:var(--text-muted)]">{metric.sub}</div>
              <div
                className="pointer-events-none absolute inset-x-7 bottom-0 h-px"
                style={{
                  background: metric.accent
                    ? 'linear-gradient(90deg, transparent, rgba(245,185,66,0.6), transparent)'
                    : 'linear-gradient(90deg, transparent, rgba(180,220,255,0.15), transparent)',
                }}
              />
            </article>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-[color:var(--text-muted)]">
          <Note color="success" label="Verified against utility tariff schedule" />
          <Note color="muted" label="Includes federal ITC + MACRS depreciation" />
          <Note color="muted" label="Excludes state/utility rebates (additive)" />
        </div>
      </div>
    </section>
  )
}

function Note({ color, label }: { color: 'success' | 'muted'; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: color === 'success' ? 'var(--success)' : 'var(--text-muted)',
        }}
      />
      <span>{label}</span>
    </div>
  )
}
