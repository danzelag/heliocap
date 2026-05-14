'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'
import { prospectStages, resolveProspectVisualTarget, type Prospect, type ProspectStage } from '@/lib/prospect'
import { recordProposalJobEvent } from '@/lib/proposal-job-events'

const DEFAULT_SITE_URL = 'https://heliocap.vercel.app'
const BULK_PROPOSAL_LIMIT = 25

function isProspectStage(value: string): value is ProspectStage {
  return prospectStages.includes(value as ProspectStage)
}

async function getUniqueSlug(baseValue: string) {
  const supabase = await createAdminClient()
  const baseSlug = SolarUtils.generateSlug(baseValue)
  let slug = baseSlug

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (error) throw error
    if (!data) return slug
    slug = `${baseSlug}-${attempt + 1}`
  }

  return `${baseSlug}-${Date.now().toString(36)}`
}

export async function updateProspectStageAction(id: string, stage: ProspectStage) {
  if (!id) return { success: false, error: 'Missing prospect ID' }
  if (!isProspectStage(stage)) return { success: false, error: 'Invalid pipeline stage' }

  const supabase = await createAdminClient()
  const { error } = await supabase
    .from('prospects')
    .update({ pipeline_stage: stage })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  return { success: true }
}

export async function promoteProspectToLeadAction(id: string) {
  if (!id) return { success: false, error: 'Missing prospect ID' }

  const supabase = await createAdminClient()
  const { data: prospect, error: prospectError } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (prospectError) return { success: false, error: prospectError.message }
  if (!prospect) return { success: false, error: 'Prospect not found' }

  const result = await queueProposalForProspect(supabase, prospect)

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')

  return result
}

export async function bulkPromoteProspectsToLeadsAction(ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean).slice(0, BULK_PROPOSAL_LIMIT)

  if (uniqueIds.length === 0) return { success: false, error: 'Select at least one prospect.' }
  if (ids.length > BULK_PROPOSAL_LIMIT) {
    return { success: false, error: `Select ${BULK_PROPOSAL_LIMIT} or fewer prospects at a time.` }
  }

  const supabase = await createAdminClient()
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('*')
    .in('id', uniqueIds)

  if (error) return { success: false, error: error.message }

  const results = await Promise.all((prospects || []).map((prospect) => queueProposalForProspect(supabase, prospect)))
  const queued = results.filter((result) => result.success).length
  const failed = results.length - queued
  const missing = uniqueIds.length - results.length

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')

  return {
    success: queued > 0,
    queued,
    failed: failed + missing,
    results,
    error: queued === 0 ? 'No proposal jobs were queued.' : undefined,
  }
}

async function queueProposalForProspect(supabase: Awaited<ReturnType<typeof createAdminClient>>, prospect: Prospect) {
  if (prospect.pipeline_stage === 'coordinate_review' || prospect.needs_review) {
    return {
      success: false,
      error: prospect.review_reason || 'Prospect needs coordinate review before proposal generation.',
    }
  }

  if (prospect.lead_id && prospect.microsite_slug) {
    if (prospect.pipeline_stage !== 'microsite_live') {
      await supabase
        .from('prospects')
        .update({ pipeline_stage: 'microsite_live' })
        .eq('id', prospect.id)
    }

    return {
      success: true,
      lead_id: prospect.lead_id,
      slug: prospect.microsite_slug,
      url: `${DEFAULT_SITE_URL}/proposal/${prospect.microsite_slug}`,
      already_live: true,
    }
  }

  const businessName = prospect.owner_llc || prospect.owner_name || prospect.address.split(',')[0] || 'Helio Cap Prospect'
  const slug = await getUniqueSlug(businessName)

  if (prospect.lat == null || prospect.lng == null) {
    return { success: false, error: 'Prospect needs lat/lng before it can be promoted.' }
  }

  const visualTarget = resolveProspectVisualTarget(prospect)
  if (!visualTarget) {
    return { success: false, error: 'Prospect needs valid visual coordinates before it can be promoted.' }
  }

  const webhookUrl = process.env.N8N_CREATE_PROPOSAL_WEBHOOK_URL
  if (!webhookUrl) {
    return { success: false, error: 'N8N_CREATE_PROPOSAL_WEBHOOK_URL is not configured' }
  }

  const { data: job, error: jobError } = await supabase
    .from('proposal_jobs')
    .insert([{
      business_name: businessName,
      address: prospect.address,
      lat: visualTarget.lat,
      lng: visualTarget.lng,
      slug,
      status: 'queued',
      current_step: 'Queued from prospect table',
      progress_percent: 2,
      receipt: {
        prospect_id: prospect.id,
        source: 'prospect_table',
        visual_target: visualTarget,
      },
    }])
    .select('id')
    .single()

  if (jobError) return { success: false, error: jobError.message }
  await recordProposalJobEvent(supabase, {
    jobId: job.id,
    businessName,
    status: 'queued',
    step: 'Queued from prospect table',
    progressPercent: 2,
  })

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_name: businessName,
      address: prospect.address,
      lat: visualTarget.lat,
      lng: visualTarget.lng,
      slug,
      prospect_id: prospect.id,
      job_id: job.id,
      visual_target: visualTarget,
    }),
    cache: 'no-store',
  })

  const receiptText = await response.text()
  const receipt = parseJsonReceipt(receiptText)

  if (!response.ok) {
    await supabase
      .from('proposal_jobs')
      .update({
        status: 'failed',
        current_step: 'n8n rejected the prospect job',
        progress_percent: 100,
        error_message: getReceiptMessage(receipt) || `n8n returned ${response.status}`,
        receipt,
      })
      .eq('id', job.id)
    await recordProposalJobEvent(supabase, {
      jobId: job.id,
      businessName,
      status: 'failed',
      step: 'n8n rejected the prospect job',
      progressPercent: 100,
      errorMessage: getReceiptMessage(receipt) || `n8n returned ${response.status}`,
    })

    return {
      success: false,
      error: getReceiptMessage(receipt) || `n8n returned ${response.status}`,
    }
  }

  await supabase
    .from('proposal_jobs')
    .update({
      status: 'running',
      current_step: 'n8n workflow started',
      progress_percent: 8,
      receipt: {
        ...(receipt || {}),
        prospect_id: prospect.id,
        source: 'prospect_table',
        visual_target: visualTarget,
      },
    })
    .eq('id', job.id)
  await recordProposalJobEvent(supabase, {
    jobId: job.id,
    businessName,
    status: 'running',
    step: 'n8n workflow started',
    progressPercent: 8,
  })

  return {
    success: true,
    job_id: job.id,
    slug,
    queued: true,
  }
}

export async function clearProposalQueueAction() {
  const supabase = await createAdminClient()

  const { data: jobs, error: fetchError } = await supabase
    .from('proposal_jobs')
    .select('id')
    .in('status', ['completed', 'failed'])

  if (fetchError) return { success: false, error: fetchError.message }
  if (!jobs || jobs.length === 0) return { success: true, cleared: 0 }

  const ids = jobs.map((j) => j.id)

  await supabase.from('proposal_job_events').delete().in('job_id', ids)
  const { error } = await supabase.from('proposal_jobs').delete().in('id', ids)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/pipeline')
  return { success: true, cleared: ids.length }
}

export async function bulkDeleteProspectsAction(ids: string[]) {
  const uniqueIds = [...new Set(ids)].filter(Boolean)
  if (uniqueIds.length === 0) return { success: false, error: 'No prospects selected.' }

  const supabase = await createAdminClient()
  const { error } = await supabase
    .from('prospects')
    .delete()
    .in('id', uniqueIds)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  return { success: true, deleted: uniqueIds.length }
}

export async function deleteProspectAction(id: string) {
  if (!id) return { success: false, error: 'Missing prospect ID' }

  const supabase = await createAdminClient()
  const { error } = await supabase
    .from('prospects')
    .delete()
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  return { success: true }
}

export async function triggerProspectEnrichmentAction(id: string) {
  if (!id) return { success: false, error: 'Missing prospect ID' }

  const webhookUrl = process.env.N8N_ENRICH_WEBHOOK_URL
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    return { success: false, error: 'N8N_ENRICH_WEBHOOK_URL is not configured' }
  }
  if (!secret) {
    return { success: false, error: 'N8N_WEBHOOK_SECRET is not configured' }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ prospectId: id }),
  })

  if (!response.ok) {
    return { success: false, error: `n8n returned ${response.status}` }
  }

  return { success: true }
}

function parseJsonReceipt(value: string): Record<string, unknown> | null {
  if (!value) return null

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return { message: value }
  }
}

function getReceiptUrl(receipt: Record<string, unknown> | null) {
  if (!receipt) return null

  const candidates = [receipt.url, receipt.proposal_url, receipt.proposalUrl]
  const url = candidates.find((value): value is string => typeof value === 'string' && value.length > 0)

  return url || null
}

function getReceiptMessage(receipt: Record<string, unknown> | null) {
  if (!receipt) return null

  const candidates = [receipt.error, receipt.message]
  const message = candidates.find((value): value is string => typeof value === 'string' && value.length > 0)

  return message || null
}
