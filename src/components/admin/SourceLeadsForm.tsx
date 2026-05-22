'use client'

import { Button } from '@/components/ui/button'
import { Home, RadioTower } from 'lucide-react'
import Link from 'next/link'

export function SourceLeadsForm() {
  return (
    <section className="admin-panel admin-intake-panel min-w-0 rounded-lg border border-[#30343b] bg-[#181a1f] p-4 shadow-[0_14px_34px_rgba(0,0,0,0.24)] lg:p-5">
      <div className="flex h-full flex-col justify-between gap-5">
        <div>
          <div className="admin-eyebrow">Generator input</div>
          <h2 className="mt-1 text-xl font-semibold text-stone-50">Lead source</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Bring in a homeowner lead, verify the roof target, then generate the Solar API render and proposal page.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/">
            <Button className="h-11 w-full rounded-lg bg-amber-300 px-4 text-sm font-semibold text-stone-950 hover:bg-amber-200">
              <Home className="mr-2 h-4 w-4" />
              Open landing page
            </Button>
          </Link>
          <div className="admin-intake-source flex min-h-11 items-center gap-2.5 rounded-lg border border-[#30343b] bg-[#15171b] px-3 py-2 text-[#d99a3d]">
            <RadioTower className="h-4 w-4" />
            <div>
              <div className="text-sm font-semibold text-stone-100">Direct intake</div>
              <div className="mt-0.5 text-xs text-slate-500">No external automation</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
