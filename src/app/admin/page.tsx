import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { LeadTable } from '@/components/admin/LeadTable'
import { Lead } from '@/services/lead.service'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  // Fetch leads using the service for consistency
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-border bg-white">
        <span className="text-lg font-bold tracking-tight text-primary uppercase font-sans tracking-widest">Helio Cap Control Center</span>
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {user.email}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-8 mt-8">
        <div className="flex justify-between items-end mb-12">
          <div>
            <h1 className="text-4xl font-bold text-primary tracking-tight">Client Portfolios</h1>
            <p className="text-muted-foreground mt-2 text-sm">Manage and generate high-converting commercial solar infrastructure proposals.</p>
          </div>
          <Link href="/admin/leads/new">
             <Button className="bg-accent hover:bg-[#065F46] text-white rounded-sm font-bold tracking-[0.2em] h-12 px-8 shadow-lg shadow-accent/20">
               <Plus className="w-4 h-4 mr-2" />
               NEW LEAD
             </Button>
          </Link>
        </div>

        <LeadTable initialLeads={(leads as Lead[]) || []} />
      </main>
    </div>
  )
}
