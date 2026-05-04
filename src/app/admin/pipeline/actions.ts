'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'
import { prospectStages, type ProspectStage } from '@/lib/prospect'

const DEFAULT_SITE_URL = 'https://heliocap.vercel.app'

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

  if (prospect.lead_id && prospect.microsite_slug) {
    return {
      success: true,
      lead_id: prospect.lead_id,
      slug: prospect.microsite_slug,
      url: `${DEFAULT_SITE_URL}/proposal/${prospect.microsite_slug}`,
    }
  }

  const businessName = prospect.owner_llc || prospect.owner_name || prospect.address.split(',')[0] || 'OpenClaw Prospect'
  const slug = await getUniqueSlug(businessName)

  if (prospect.lat == null || prospect.lng == null) {
    return { success: false, error: 'Prospect needs lat/lng before it can be promoted.' }
  }

  const webhookUrl = process.env.N8N_CREATE_PROPOSAL_WEBHOOK_URL
  if (!webhookUrl) {
    return { success: false, error: 'N8N_CREATE_PROPOSAL_WEBHOOK_URL is not configured' }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_name: businessName,
      address: prospect.address,
      lat: prospect.lat,
      lng: prospect.lng,
      slug,
      prospect_id: prospect.id,
    }),
    cache: 'no-store',
  })

  const receiptText = await response.text()
  const receipt = parseJsonReceipt(receiptText)

  if (!response.ok) {
    return {
      success: false,
      error: getReceiptMessage(receipt) || `n8n returned ${response.status}`,
    }
  }

  const receiptSlug = typeof receipt?.slug === 'string' ? receipt.slug : slug
  const leadId = typeof receipt?.lead_id === 'string' ? receipt.lead_id : null
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '')
  const url = getReceiptUrl(receipt) || `${siteUrl}/proposal/${receiptSlug}`

  const { error: updateError } = await supabase
    .from('prospects')
    .update({
      lead_id: leadId,
      microsite_slug: receiptSlug,
      pipeline_stage: 'microsite_live',
    })
    .eq('id', id)

  if (updateError) return { success: false, error: updateError.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  revalidatePath(`/proposal/${receiptSlug}`)

  return {
    success: true,
    lead_id: leadId,
    slug: receiptSlug,
    url,
  }
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
