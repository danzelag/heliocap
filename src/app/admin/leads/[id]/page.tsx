import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import EditLeadForm from './EditLeadForm'
import { Button } from '@/components/ui/button'
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
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-4 px-8 py-4 border-b border-border bg-white">
        <Link href="/admin" className="text-muted-foreground hover:text-primary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <span className="text-lg font-bold tracking-tight text-primary font-sans uppercase">Edit Lead: {lead.business_name}</span>
      </nav>

      <main className="max-w-3xl mx-auto p-8 mt-8">
        <EditLeadForm lead={lead} />
      </main>
    </div>
  )
}
