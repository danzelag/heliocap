'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { ProposalViewModel } from './types'

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export function StickyMobileCta({ proposal }: { proposal: ProposalViewModel }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const trigger = window.innerHeight * 0.8
      setVisible(window.scrollY > trigger)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 transition-all duration-500 lg:hidden ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }`}
    >
      <div className="pointer-events-auto glass-strong flex items-center justify-between gap-3 rounded-[24px] px-4 py-3">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Annual savings
          </div>
          <div className="num truncate text-lg font-semibold tracking-tight text-[color:var(--solar-gold)]">
            {fmtUSD(proposal.annualSavings)}
          </div>
        </div>
        <a
          href="#book"
          className="cta-gold inline-flex shrink-0 items-center gap-2 rounded-[18px] px-4 py-3 text-sm font-semibold"
        >
          Book a Call
          <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}
