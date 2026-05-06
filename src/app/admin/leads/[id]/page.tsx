import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import EditLeadForm from './EditLeadForm'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()

  if (!lead) {
    notFound()
  }

  return (
    <div className="admin-shell">
      <nav className="admin-nav px-5 py-3 lg:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <Link href="/admin" prefetch className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <span className="admin-title">Edit proposal</span>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-5 py-6 lg:px-8">
        <EditLeadForm lead={lead} />
      </main>
    </div>
  )
}
