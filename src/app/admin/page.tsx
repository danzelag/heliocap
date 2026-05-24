import { Metadata } from 'next'
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, RadioTower, Sun } from 'lucide-react'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import { LeadTable } from '@/components/admin/LeadTable'
import { ProposalJobsQueue, type ProposalJob, type ProposalJobEvent } from '@/components/admin/ProposalJobsQueue'
import type { Lead } from '@/services/lead.service'

export const metadata: Metadata = {
  title: 'Proposals — HelioCap Command Centre',
}

export const revalidate = 0

function formatCompactCAD(value: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(value)
}

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const [leadsResult, prospectsResult, jobsResult, jobEventsResult] = await Promise.all([
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
    supabase.from('prospects').select('pipeline_stage'),
    supabase
      .from('proposal_jobs')
      .select('id, business_name, address, slug, status, current_step, progress_percent, proposal_url, error_message, receipt, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(24),
    supabase
      .from('proposal_job_events')
      .select('id, job_id, business_name, status, step, progress_percent, proposal_url, error_message, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const leadRows = (leadsResult.data as Lead[]) || []
  const prospectRows = (prospectsResult.data as { pipeline_stage: string }[]) || []
  const jobRows = (jobsResult.data as ProposalJob[]) || []
  const jobEventRows = (jobEventsResult.data as ProposalJobEvent[]) || []

  const publishedCount = leadRows.filter((l) => l.status === 'published').length
  const contactedCount = leadRows.filter((l) => l.status === 'contacted' || l.status === 'emailed').length
  const repliedCount = leadRows.filter((l) => l.status === 'replied').length
  const bookedCount = leadRows.filter((l) => l.status === 'booked').length
  const flaggedSavings = leadRows.reduce((total, l) => total + (l.estimated_savings || 0), 0)
  const activeJobs = jobRows.filter((j) => j.status === 'running' || j.status === 'queued').length
  const failedJobs = jobRows.filter((j) => j.status === 'failed').length
  const lastPublished = leadRows.find((l) => l.status === 'published')

  return (
    <div
      className="min-h-screen bg-[#0b0e10]"
      style={{ fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif', color: '#e0ddd8' }}
    >
      <AdminRoutePrefetcher />

      {/* ── Nav ─────────────────────────────────────────────── */}
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
            <Link
              href="/admin"
              prefetch
              className="rounded-lg border border-[#3a2f1e] bg-[#19140c] px-3 py-2 text-xs font-semibold text-[#d99a3d]"
            >
              Proposals
            </Link>
            <Link
              href="/admin/pipeline"
              prefetch
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1a1f25] bg-transparent px-3 py-2 text-xs font-semibold text-[#6b7580] transition-colors hover:border-[#252c34] hover:text-[#9aa3ad]"
            >
              <RadioTower className="h-3.5 w-3.5" />
              Pipeline
            </Link>
            <Link
              href="/admin/leads/new"
              prefetch
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#d99a3d] px-3 py-2 text-xs font-bold text-[#1a0e00] transition-colors hover:bg-[#e6a845]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Lead
            </Link>
            <div className="hidden max-w-[200px] truncate rounded-lg border border-[#1a1f25] px-3 py-2 text-xs text-[#3a4048] md:block">
              {user.email}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Main ────────────────────────────────────────────── */}
      <main className="mx-auto max-w-[1600px] space-y-5 px-5 py-6">

        {/* Stats strip */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-[#141414] pb-4 text-[12px]">
          <span>
            <span className={publishedCount > 0 ? 'font-semibold text-[#d99a3d]' : 'text-[#3a4048]'}>{publishedCount}</span>
            <span className="ml-1.5 text-[#2e353d]">proposals live</span>
          </span>
          <span className="text-[#1e2429]">·</span>
          <span>
            <span className={flaggedSavings > 0 ? 'font-semibold text-[#d99a3d]' : 'text-[#3a4048]'}>{formatCompactCAD(flaggedSavings)}</span>
            <span className="ml-1.5 text-[#2e353d]">pipeline</span>
          </span>
          <span className="text-[#1e2429]">·</span>
          <span>
            <span className="text-[#5a6370]">{contactedCount}</span>
            <span className="ml-1.5 text-[#2e353d]">contacted</span>
          </span>
          <span className="text-[#1e2429]">·</span>
          <span>
            <span className="text-[#5a6370]">{repliedCount}</span>
            <span className="ml-1.5 text-[#2e353d]">replied</span>
          </span>
          <span className="text-[#1e2429]">·</span>
          <span>
            <span className="text-[#5a6370]">{bookedCount}</span>
            <span className="ml-1.5 text-[#2e353d]">booked</span>
          </span>
          {activeJobs > 0 && (
            <>
              <span className="text-[#1e2429]">·</span>
              <span>
                <span className="animate-pulse font-semibold text-amber-500/80">{activeJobs}</span>
                <span className="ml-1.5 text-[#2e353d]">building</span>
              </span>
            </>
          )}
          {failedJobs > 0 && (
            <>
              <span className="text-[#1e2429]">·</span>
              <span>
                <span className="font-semibold text-red-400">{failedJobs}</span>
                <span className="ml-1.5 text-[#2e353d]">failed</span>
              </span>
            </>
          )}
          <span className="text-[#1e2429]">·</span>
          <span>
            <span className="text-[#5a6370]">{prospectRows.length}</span>
            <span className="ml-1.5 text-[#2e353d]">prospects</span>
          </span>
          {lastPublished && (
            <>
              <span className="text-[#1e2429]">·</span>
              <span className="text-[#2e353d]">
                Last: <span className="text-[#5a6370]">{lastPublished.business_name}</span>
              </span>
            </>
          )}
        </div>

        {/* Live queue */}
        <ProposalJobsQueue initialJobs={jobRows} initialEvents={jobEventRows} />

        {/* Leads table */}
        <LeadTable initialLeads={leadRows} />
      </main>
    </div>
  )
}
