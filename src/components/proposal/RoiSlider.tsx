'use client'

import { useMemo, useState } from 'react'
import type { ProposalViewModel } from './types'

function fmtUSD(n: number, max = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: max,
  }).format(n)
}

export function RoiSlider({ proposal }: { proposal: ProposalViewModel }) {
  const [monthly, setMonthly] = useState(Math.round(proposal.monthlyBill))
  const rate = proposal.utilityRate || 0.14

  const { annualSavings, payback, roi, systemKw } = useMemo(() => {
    const offsetRate = 0.85
    const annual = monthly * 12 * offsetRate
    const kw = Math.round((monthly * 12 * offsetRate) / (1650 * rate))
    const cost = kw * 2200
    const pb = cost > 0 && annual > 0 ? cost / annual : 0
    const roiPct = cost > 0 ? ((20 * annual - cost) / cost) * 100 : 0
    return { annualSavings: annual, payback: pb, roi: roiPct, systemKw: kw }
  }, [monthly, rate])

  const min = 1000
  const max = 50000
  const pct = ((monthly - min) / (max - min)) * 100

  return (
    <section className="w-full py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-12 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              04 - Interactive Model
            </span>
            <h2 className="mt-3 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl">
              Adjust your current electricity spend.
            </h2>
          </div>
          <p className="max-w-sm text-sm text-[color:var(--text-secondary)]">
            Drag to model a different baseline. Savings, payback, and ROI update live.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="glass card-lift rounded-3xl p-8 lg:col-span-3 lg:p-10">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                Average monthly bill
              </span>
              <span className="font-mono text-[11px] text-[color:var(--text-muted)]">
                USD / month
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="num text-6xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-7xl">
                {fmtUSD(monthly)}
              </span>
            </div>

            <div className="mt-10">
              <div className="relative">
                <div className="h-1 w-full rounded-full bg-[color:var(--border-soft)]" />
                <div
                  className="absolute top-0 h-1 rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, #F5B942 0%, #D99028 100%)',
                    boxShadow: '0 0 18px rgba(245,185,66,0.45)',
                  }}
                />
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={500}
                  value={monthly}
                  onChange={(event) => setMonthly(Number(event.target.value))}
                  aria-label="Average monthly electricity bill"
                  className="range-gold absolute inset-0 h-1 w-full cursor-pointer"
                />
              </div>
              <div className="mt-4 flex justify-between font-mono text-[11px] uppercase tracking-widest text-[color:var(--text-muted)]">
                <span>{fmtUSD(min)}</span>
                <span>{fmtUSD(max)}</span>
              </div>
            </div>

            <div className="mt-10 flex items-center gap-3 border-t border-[color:var(--border-soft)] pt-6 text-xs text-[color:var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)]" />
              <span>Modeled at {fmtUSD(rate, 2)}/kWh blended rate / 85% offset target</span>
            </div>
          </div>

          <div className="grid gap-3 lg:col-span-2">
            <Stat label="Annual savings" value={fmtUSD(annualSavings)} accent />
            <Stat label="Payback period" value={`${payback.toFixed(1)} yrs`} />
            <Stat label="20-year ROI" value={`${roi.toFixed(0)}%`} />
            <Stat label="System size" value={`${systemKw} kW`} mono />
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  accent,
  mono,
}: {
  label: string
  value: string
  accent?: boolean
  mono?: boolean
}) {
  return (
    <div className="glass-soft card-lift flex items-center justify-between rounded-2xl px-6 py-5">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <span
        className={`num text-2xl font-semibold tracking-tight tabular-nums md:text-3xl ${
          accent ? 'text-[color:var(--solar-gold)]' : 'text-[color:var(--text-primary)]'
        } ${mono ? 'font-mono text-xl md:text-2xl' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
