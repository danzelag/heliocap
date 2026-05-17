import { ChevronLeft, FilePlus2 } from 'lucide-react'
import Link from 'next/link'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'
import LeadGeneratorForm from './LeadGeneratorForm'

export default function NewLeadPage() {
  return (
    <div className="admin-shell">
      <AdminRoutePrefetcher />

      <nav className="admin-nav sticky top-0 z-20 px-5 py-3 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" prefetch className="admin-nav-pill h-9 w-9 px-0" aria-label="Back to command center">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="admin-eyebrow">Helio Cap</div>
              <div className="admin-title">Add prospect</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AdminThemeToggle />
            <div className="admin-chip hidden px-3 py-2 text-sm font-medium sm:flex">
              <FilePlus2 className="h-3.5 w-3.5" />
              Residential
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <div className="admin-panel mb-5 p-4 lg:p-5">
          <div className="admin-eyebrow">Residential prospect</div>
          <h1 className="mt-1 text-2xl font-semibold text-stone-50">Add homeowner manually</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Use this when a homeowner gives you their details directly. It creates a prospect row only; verify the roof before generating a proposal.
          </p>
        </div>

        <LeadGeneratorForm />
      </main>
    </div>
  )
}
