import { CheckCircle2, Clock3 } from 'lucide-react'
import type { ProposalViewModel } from './types'

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function Incentives({ proposal }: { proposal: ProposalViewModel }) {
  const total = proposal.incentives.reduce((acc, incentive) => acc + incentive.amount, 0)

  return (
    <section className="w-full py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-14 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              03 - Incentives & Rebates
            </span>
            <h2 className="mt-3 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl">
              Stack the credits you have already earned.
            </h2>
          </div>
          <div className="glass-soft inline-flex items-center gap-3 rounded-2xl px-5 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Total stack
            </span>
            <span className="num text-2xl font-semibold tracking-tight text-[color:var(--solar-gold)]">
              {fmtUSD(total)}
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {proposal.incentives.map((item, index) => {
            const confirmed = item.status === 'Confirmed'
            return (
              <article
                key={item.label}
                className="glass card-lift animate-fade-up flex items-start gap-5 rounded-3xl p-6 lg:p-7"
                style={{ animationDelay: `${(index + 1) * 60}ms` }}
              >
                <div
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
                  style={{
                    background: confirmed
                      ? 'linear-gradient(135deg, rgba(116,217,159,0.20) 0%, rgba(116,217,159,0.06) 100%)'
                      : 'linear-gradient(135deg, rgba(242,184,75,0.18) 0%, rgba(242,184,75,0.06) 100%)',
                    border: `1px solid ${
                      confirmed ? 'rgba(116,217,159,0.30)' : 'rgba(242,184,75,0.30)'
                    }`,
                  }}
                >
                  {confirmed ? (
                    <CheckCircle2
                      className="h-5 w-5 text-[color:var(--success)]"
                      strokeWidth={1.8}
                    />
                  ) : (
                    <Clock3 className="h-5 w-5 text-[color:var(--warning)]" strokeWidth={1.8} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-base font-semibold text-[color:var(--text-primary)]">
                      {item.label}
                    </h3>
                    <span className="num shrink-0 text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">
                      {fmtUSD(item.amount)}
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]">
                    {item.source}
                  </p>
                  <span
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest"
                    style={{
                      borderColor: confirmed ? 'rgba(116,217,159,0.32)' : 'rgba(242,184,75,0.32)',
                      color: confirmed ? 'var(--success)' : 'var(--warning)',
                      background: confirmed ? 'rgba(116,217,159,0.06)' : 'rgba(242,184,75,0.06)',
                    }}
                  >
                    {item.status}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
