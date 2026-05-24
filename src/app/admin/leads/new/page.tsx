import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, RadioTower, Sun } from 'lucide-react'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import LeadGeneratorForm from './LeadGeneratorForm'

export default async function NewLeadPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  return (
    <div className="min-h-screen bg-[#0b0e10]" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif', color: '#e0ddd8' }}>
      <AdminRoutePrefetcher />

      <nav className="sticky top-0 z-20 border-b border-[#1a1f25] bg-[#0c0f12]">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#2e2519] bg-[#15120b] text-[#d99a3d]">
              <Sun className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">HelioCap</div>
              <div className="text-[14px] font-bold leading-tight text-[#e0ddd8]">Command Centre</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin" prefetch className="inline-flex items-center gap-1.5 rounded-lg border border-[#1a1f25] bg-transparent px-3 py-2 text-xs font-semibold text-[#6b7580] transition-colors hover:border-[#252c34] hover:text-[#9aa3ad]">
              Proposals
            </Link>
            <Link href="/admin/pipeline" prefetch className="inline-flex items-center gap-1.5 rounded-lg border border-[#1a1f25] bg-transparent px-3 py-2 text-xs font-semibold text-[#6b7580] transition-colors hover:border-[#252c34] hover:text-[#9aa3ad]">
              <RadioTower className="h-3.5 w-3.5" />
              Pipeline
            </Link>
            <Link href="/admin/leads/new" prefetch className="inline-flex items-center gap-1.5 rounded-lg border border-[#3a2f1e] bg-[#19140c] px-3 py-2 text-xs font-bold text-[#d99a3d]">
              <Plus className="h-3.5 w-3.5" />
              Add Lead
            </Link>
            {user.email && (
              <div className="hidden rounded-lg border border-[#1a1f25] bg-[#0c0f12] px-3 py-2 text-xs text-[#3a4048] sm:block">
                {user.email}
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1600px] px-5 py-6">
        <div className="mb-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#4a5560]">New prospect</div>
          <h1 className="mt-1 text-xl font-bold text-[#e0ddd8]">Add homeowner</h1>
          <p className="mt-1.5 text-[13px] text-[#3a4048]">Save the lead, then verify the roof from Prospects before generating a proposal.</p>
        </div>
        <LeadGeneratorForm />
      </main>
    </div>
  )
}
