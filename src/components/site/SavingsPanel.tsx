'use client'

import { useState, useMemo } from 'react'
import { SolarUtils } from '@/lib/solar-utils'

interface SavingsPanelProps {
  initialSavings: number
  initialPayback: number
  buildingType: string
}

function fmtUSD(n: number, max = 0) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: max }).format(n);
}

export function SavingsPanel({ initialSavings, initialPayback, buildingType }: SavingsPanelProps) {
  const defaultRate = SolarUtils.getRateByBuildingType(buildingType)
  const [rate, setRate] = useState(defaultRate)

  const { annualProductionKWh, netCost } = useMemo(() => ({
    annualProductionKWh: initialSavings / defaultRate,
    netCost: initialPayback * initialSavings,
  }), [initialSavings, initialPayback, defaultRate])

  const savings = annualProductionKWh * rate
  const payback = netCost > 0 && savings > 0 ? netCost / savings : 0
  const savings20yr = Math.round(savings) * 20
  const roi = netCost > 0 ? ((20 * savings - netCost) / netCost) * 100 : 0
  const systemKw = Math.round(annualProductionKWh / 1650) // Assuming 1650 kWh/kW/yr

  const min = 0.08;
  const max = 0.30;
  const pct = ((rate - min) / (max - min)) * 100;

  return (
    <section className="snap-start min-h-screen flex flex-col justify-center w-full bg-primary py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10 w-full">
        <div className="mb-12 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
              03 — Interactive Model
            </span>
            <h2 className="mt-3 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Adjust your utility rate.
            </h2>
          </div>
          <p className="max-w-sm text-sm text-white/60">
            Drag to model a different baseline rate. Savings, payback, and ROI update live.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-5">
          {/* Slider card */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-8 lg:col-span-3 lg:p-10">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">
                Assumed Utility Rate
              </span>
              <span className="font-mono text-[11px] text-white/50">USD / kWh</span>
            </div>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="num text-6xl font-semibold tracking-tight text-white md:text-7xl">
                {fmtUSD(rate, 3)}
              </span>
            </div>

            {/* Custom slider */}
            <div className="mt-10">
              <div className="relative">
                <div className="h-1 w-full rounded-full bg-white/10" />
                <div
                  className="absolute top-0 h-1 rounded-full bg-white"
                  style={{ width: `${pct}%` }}
                />
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.005}
                  value={rate}
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  aria-label="Assumed Utility Rate"
                  className="absolute inset-0 h-1 w-full cursor-pointer appearance-none bg-transparent
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                    [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary
                    [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(15,23,42,0.25)]
                    [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-primary"
                />
              </div>
              <div className="mt-4 flex justify-between font-mono text-[11px] uppercase tracking-widest text-white/50">
                <span>{fmtUSD(min, 2)}</span>
                <span>{fmtUSD(max, 2)}</span>
              </div>
            </div>

            <div className="mt-10 flex items-center gap-3 border-t border-white/10 pt-6 text-xs text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-roi" />
              <span>Modeled against estimated annual production of {Math.round(annualProductionKWh).toLocaleString()} kWh</span>
            </div>
          </div>

          {/* Live outputs */}
          <div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 lg:col-span-2">
            <Stat label="Annual savings" value={fmtUSD(savings)} accent />
            <Stat label="Payback period" value={`${payback.toFixed(1)} yrs`} />
            <Stat label="20-year ROI" value={`${roi.toFixed(0)}%`} />
            <Stat label="System size" value={`${systemKw} kW`} mono />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between bg-white/[0.02] backdrop-blur-sm px-6 py-5 h-full">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">{label}</span>
      <span
        className={`num text-2xl font-semibold tracking-tight tabular-nums md:text-3xl ${
          accent ? "text-roi" : "text-white"
        } ${mono ? "font-mono text-xl md:text-2xl" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
