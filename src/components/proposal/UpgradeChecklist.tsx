'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import type { ProposalViewModel } from './types'

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function UpgradeChecklist({ proposal }: { proposal: ProposalViewModel }) {
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(proposal.upgrades.map((upgrade) => [upgrade.id, upgrade.included])),
  )
  const [open, setOpen] = useState<string | null>(null)

  const totalUplift = useMemo(
    () =>
      proposal.upgrades
        .filter((upgrade) => included[upgrade.id])
        .reduce((acc, upgrade) => acc + upgrade.savings, 0),
    [included, proposal.upgrades],
  )

  return (
    <section className="w-full py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <div className="mb-14 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
              05 - System Configuration
            </span>
            <h2 className="mt-3 max-w-2xl text-balance text-4xl font-semibold tracking-tight text-[color:var(--text-primary)] md:text-5xl">
              Tune your build. See savings update live.
            </h2>
          </div>
          <div className="glass-soft inline-flex items-center gap-3 rounded-2xl px-5 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Annual uplift
            </span>
            <span className="num text-2xl font-semibold tracking-tight text-[color:var(--solar-gold)]">
              {fmtUSD(totalUplift)}
            </span>
          </div>
        </div>

        <div className="glass overflow-hidden rounded-3xl">
          {proposal.upgrades.map((upgrade, index) => {
            const isOn = !!included[upgrade.id]
            const isOpen = open === upgrade.id
            const last = index === proposal.upgrades.length - 1
            return (
              <div
                key={upgrade.id}
                className={`group transition-colors hover:bg-white/[0.02] ${
                  last ? '' : 'border-b border-[color:var(--border-soft)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpen((state) => (state === upgrade.id ? null : upgrade.id))}
                  aria-expanded={isOpen}
                  aria-controls={`upgrade-detail-${upgrade.id}`}
                  className="flex w-full items-center gap-4 px-5 py-5 text-left lg:px-7 lg:py-6"
                >
                  <span
                    role="checkbox"
                    aria-checked={isOn}
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (upgrade.optional) {
                        setIncluded((state) => ({ ...state, [upgrade.id]: !state[upgrade.id] }))
                      }
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === ' ' || event.key === 'Enter') && upgrade.optional) {
                        event.preventDefault()
                        event.stopPropagation()
                        setIncluded((state) => ({ ...state, [upgrade.id]: !state[upgrade.id] }))
                      }
                    }}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-all ${
                      isOn
                        ? 'border-transparent'
                        : 'border-[color:var(--border-strong)] bg-transparent'
                    } ${upgrade.optional ? 'cursor-pointer' : 'cursor-default opacity-90'}`}
                    style={
                      isOn
                        ? {
                            background: 'linear-gradient(135deg, #F5B942 0%, #D99028 100%)',
                            boxShadow: '0 4px 12px rgba(245,185,66,0.35)',
                          }
                        : {}
                    }
                  >
                    {isOn && (
                      <Check
                        key={`${upgrade.id}-on`}
                        className="animate-check h-4 w-4 text-[#1A0F00]"
                        strokeWidth={3}
                      />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-[color:var(--text-primary)]">
                        {upgrade.label}
                      </h3>
                      {!upgrade.optional && (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-[color:var(--text-muted)]">
                          / Included
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="hidden items-center gap-4 sm:flex">
                    {upgrade.savings > 0 && (
                      <span className="num text-sm font-semibold text-[color:var(--success)]">
                        +{fmtUSD(upgrade.savings)}/yr
                      </span>
                    )}
                  </div>

                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-[color:var(--text-muted)] transition-transform duration-300 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <div
                  id={`upgrade-detail-${upgrade.id}`}
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <div className="px-5 pb-6 pl-[3.75rem] text-sm text-[color:var(--text-secondary)] lg:px-7 lg:pl-[4.5rem]">
                      <p className="max-w-3xl leading-relaxed">{upgrade.description}</p>
                      {upgrade.savings > 0 && (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[color:var(--border-soft)] bg-white/[0.02] px-3 py-1 text-xs">
                          <Plus className="h-3 w-3 text-[color:var(--success)]" />
                          <span className="num text-[color:var(--text-primary)]">
                            +{fmtUSD(upgrade.savings)}
                          </span>
                          <span className="text-[color:var(--text-muted)]">annual savings</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-6 text-center text-xs text-[color:var(--text-muted)]">
          Toggle optional items to model their impact. Required items are part of the base scope.
        </p>
      </div>
    </section>
  )
}
