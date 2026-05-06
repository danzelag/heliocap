import { ChevronLeft, FilePlus2 } from 'lucide-react'
import Link from 'next/link'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import LeadGeneratorForm from './LeadGeneratorForm'

export default function NewLeadPage() {
  return (
    <div className="admin-shell">
      <AdminRoutePrefetcher />

      <nav className="admin-nav sticky top-0 z-20 px-5 py-3 lg:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" prefetch className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="admin-eyebrow">Helio Cap</div>
              <div className="admin-title">New proposal</div>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 sm:flex">
            <FilePlus2 className="h-3.5 w-3.5 text-slate-400" />
            New
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-5 py-6 lg:px-8">
        <div className="admin-panel mb-5 p-4 lg:p-5">
          <div className="admin-eyebrow">Proposal</div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">Create proposal</h1>
        </div>

        <LeadGeneratorForm />
      </main>
    </div>
  )
}
