'use client'

import { Button } from '@/components/ui/button'
import { Home, RadioTower } from 'lucide-react'
import Link from 'next/link'

export function SourceLeadsForm() {
  return (
    <section className="admin-panel p-4 lg:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="admin-eyebrow">Residential intake</div>
          <h2 className="mt-1 text-xl font-semibold text-stone-50">Commercial scraping disabled</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            New prospects now come from the homeowner landing page and save directly into Supabase.
            n8n is no longer used to scrape or create prospect rows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/">
            <Button className="h-10 rounded-lg bg-amber-300 px-4 text-sm font-semibold text-stone-950 hover:bg-amber-200">
              <Home className="mr-2 h-4 w-4" />
              Open landing page
            </Button>
          </Link>
          <div className="admin-chip px-3 py-2 text-sm">
            <RadioTower className="mr-2 h-4 w-4" />
            Scrape off
          </div>
        </div>
      </div>
    </section>
  )
}
