import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus, RadioTower, Sun } from 'lucide-react'
import Link from 'next/link'
import { AdminRoutePrefetcher } from '@/components/admin/AdminRoutePrefetcher'
import { AdminThemeToggle } from '@/components/admin/AdminThemeToggle'
import { LeadTable } from '@/components/admin/LeadTable'
import { ProposalJobsQueue, type ProposalJob, type ProposalJobEvent } from '@/components/admin/ProposalJobsQueue'
import { Lead } from '@/services/lead.service'

function formatCompactUSD(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: 'compact',
  }).format(value)
}

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/admin/login')
  }

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: prospects } = await supabase
    .from('prospects')
    .select('pipeline_stage')

  const { data: jobs } = await supabase
    .from('proposal_jobs')
    .select('id, business_name, address, slug, status, current_step, progress_percent, proposal_url, error_message, receipt, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(24)

  const { data: jobEvents } = await supabase
    .from('proposal_job_events')
    .select('id, job_id, business_name, status, step, progress_percent, proposal_url, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const leadRows = (leads as Lead[]) || []
  const prospectRows = (prospects as { pipeline_stage: string }[]) || []
  const jobRows = (jobs as ProposalJob[]) || []
  const jobEventRows = (jobEvents as ProposalJobEvent[]) || []

  const publishedCount = leadRows.filter((lead) => lead.status === 'published').length
  const flaggedSavings = leadRows.reduce((total, lead) => total + (lead.estimated_savings || 0), 0)
  const activeJobs = jobRows.filter((j) => j.status === 'running' || j.status === 'queued').length
  const failedJobs = jobRows.filter((j) => j.status === 'failed').length
  const lastPublished = leadRows.find((l) => l.status === 'published')

  const statusBar = [
    {
      id: 'system',
      label: 'System',
      value: 'Live',
      live: true,
      sub: null,
    },
    {
      id: 'active',
      label: 'Active Jobs',
      value: activeJobs.toString(),
      live: activeJobs > 0,
      sub: activeJobs > 0 ? 'Processing' : 'Idle',
    },
    {
      id: 'proposals',
      label: 'Proposals Ready',
      value: publishedCount.toString(),
      live: publishedCount > 0,
      sub: `${formatCompactUSD(flaggedSavings)} savings flagged`,
    },
    {
      id: 'failed',
      label: 'Failed Jobs',
      value: failedJobs.toString(),
      live: false,
      sub: failedJobs > 0 ? 'Review needed' : 'All clear',
    },
    {
      id: 'prospects',
      label: 'Prospects',
      value: prospectRows.length.toString(),
      live: prospectRows.length > 0,
      sub: 'In pipeline',
    },
    {
      id: 'last',
      label: 'Last Published',
      value: lastPublished?.business_name ?? '—',
      live: !!lastPublished,
      sub: lastPublished?.address ?? null,
    },
  ]

  return (
    <div className="admin-shell">
      <AdminRoutePrefetcher />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="cc-nav sticky top-0 z-20 px-5 lg:px-8">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-4">
            <div className="cc-brand-mark">
              <Sun className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="cc-eyebrow">HelioCap</div>
              <div className="cc-wordmark">Command Center</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="cc-chip hidden md:flex">{user.email}</div>
            <AdminThemeToggle />
            <Link href="/admin" prefetch>
              <Button variant="outline" className="cc-nav-pill cc-nav-pill-active">Proposals</Button>
            </Link>
            <Link href="/admin/pipeline" prefetch>
              <Button variant="outline" className="cc-nav-pill">
                <RadioTower className="mr-1.5 h-3.5 w-3.5" />
                Prospects
              </Button>
            </Link>
            <Link href="/admin/leads/new" prefetch>
              <Button className="cc-primary-btn h-9 px-4 text-sm">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Prospect
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Top Status Strip ────────────────────────────────── */}
      <div className="cc-status-strip px-5 lg:px-8">
        <div className="mx-auto max-w-screen-2xl">
          <div className="cc-status-grid">
            {statusBar.map((item) => (
              <div key={item.id} className="cc-status-cell">
                <div className="cc-status-label">{item.label}</div>
                <div className={`cc-status-value ${item.id === 'failed' && failedJobs > 0 ? 'cc-status-value-danger' : item.live ? 'cc-status-value-live' : ''}`}>
                  {item.id === 'system' && (
                    <span className="cc-pulse-dot" />
                  )}
                  {item.value}
                </div>
                {item.sub && <div className="cc-status-sub">{item.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="mx-auto max-w-screen-2xl px-5 py-6 lg:px-8">

        {/* ── Mission Control Hero ─── */}
        <ProposalJobsQueue initialJobs={jobRows} initialEvents={jobEventRows} />

        {/* ── Proposal Pipeline Table ─── */}
        <section className="mt-6">
          <LeadTable initialLeads={leadRows} />
        </section>
      </main>
    </div>
  )
}
