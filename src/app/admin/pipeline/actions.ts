'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'
import {
  getProspectVisualCandidate,
  prospectStages,
  resolveProspectVisualTarget,
  type Prospect,
  type ProspectStage,
} from '@/lib/prospect'
import { recordProposalJobEvent } from '@/lib/proposal-job-events'
import { fetchSolarInsights, fetchStaticSatelliteImage, uploadLeadAsset } from '@/lib/openclaw-google'
import sharp from 'sharp'

const DEFAULT_SITE_URL = 'https://heliocap.vercel.app'
const BULK_PROPOSAL_LIMIT = 25
const MAX_AUTO_SOLAR_CENTER_DRIFT_METERS = 180
const MIN_AUTO_SOLAR_PANEL_COUNT = 80
const MIN_AUTO_SOLAR_AREA_METERS = 750

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

export async function getProspectVisualPreviewAction(id: string, lat?: number, lng?: number, zoom?: number) {
  if (!id) return { success: false, error: 'Missing prospect ID' }

  const supabase = await createAdminClient()
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!prospect) return { success: false, error: 'Prospect not found' }

  const requestedLat = Number(lat)
  const requestedLng = Number(lng)
  const candidate = Number.isFinite(requestedLat) && Number.isFinite(requestedLng)
    ? { lat: requestedLat, lng: requestedLng, source: 'manual_input' as const }
    : await resolveAutoVisualCandidate(prospect as Prospect)

  if (!candidate) return { success: false, error: 'No coordinates available for preview.' }

  try {
    const previewZoom = clampZoom(zoom)
    const image = await fetchStaticSatelliteImage(candidate.lat, candidate.lng, previewZoom)
    const preview = await sharp(image)
      .resize(960, 540, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 82 })
      .toBuffer()

    return {
      success: true,
      imageDataUrl: `data:image/jpeg;base64,${preview.toString('base64')}`,
      lat: candidate.lat,
      lng: candidate.lng,
      zoom: previewZoom,
      source: candidate.source,
    }
  } catch (previewError) {
    const message = previewError instanceof Error ? previewError.message : 'Failed to generate visual preview.'
    return { success: false, error: message }
  }
}

export async function saveProspectVisualTargetAction({
  id,
  lat,
  lng,
  note,
  zoom,
}: {
  id: string
  lat: number
  lng: number
  note?: string
  zoom?: number
}) {
  if (!id) return { success: false, error: 'Missing prospect ID' }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { success: false, error: 'Enter valid visual latitude and longitude.' }
  }

  const supabase = await createAdminClient()
  const verifiedAt = new Date().toISOString()
  const visualZoom = clampZoom(zoom)
  let visualPreviewUrl: string | null = null

  try {
    const previewBuffer = await fetchStaticSatelliteImage(lat, lng, visualZoom)
    visualPreviewUrl = await uploadLeadAsset({
      supabase,
      bucket: 'prospects',
      slug: id,
      fileName: 'visual-target.png',
      body: previewBuffer,
      contentType: 'image/png',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[pipeline] Visual target preview save failed: ${message}`)
  }

  const { error } = await supabase
    .from('prospects')
    .update({
      visual_lat: lat,
      visual_lng: lng,
      visual_verified: true,
      visual_verified_at: verifiedAt,
      visual_review_note: note?.trim() || null,
      visual_zoom: visualZoom,
      visual_preview_url: visualPreviewUrl,
    })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  return {
    success: true,
    visual_lat: lat,
    visual_lng: lng,
    visual_verified: true,
    visual_verified_at: verifiedAt,
    visual_review_note: note?.trim() || null,
    visual_zoom: visualZoom,
    visual_preview_url: visualPreviewUrl,
  }
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
  const prospectWithVisualTarget = await ensureVisualTargetForProposal(supabase, prospect)

  if (
    (prospectWithVisualTarget.pipeline_stage === 'coordinate_review' || prospectWithVisualTarget.needs_review) &&
    prospectWithVisualTarget.visual_verified !== true
  ) {
    return {
      success: false,
      error: prospectWithVisualTarget.review_reason || 'Prospect needs coordinate review before proposal generation.',
    }
  }

  if (prospectWithVisualTarget.lead_id && prospectWithVisualTarget.microsite_slug) {
    if (prospectWithVisualTarget.pipeline_stage !== 'microsite_live') {
      await supabase
        .from('prospects')
        .update({ pipeline_stage: 'microsite_live' })
        .eq('id', prospectWithVisualTarget.id)
    }

    return {
      success: true,
      lead_id: prospectWithVisualTarget.lead_id,
      slug: prospectWithVisualTarget.microsite_slug,
      url: `${DEFAULT_SITE_URL}/proposal/${prospectWithVisualTarget.microsite_slug}`,
      already_live: true,
    }
  }

  const businessName = prospectWithVisualTarget.owner_llc || prospectWithVisualTarget.owner_name || prospectWithVisualTarget.address.split(',')[0] || 'Helio Cap Prospect'
  const slug = await getUniqueSlug(businessName)

  const visualTarget = resolveProspectVisualTarget(prospectWithVisualTarget)
  if (!visualTarget) {
    return { success: false, error: 'Could not auto-detect a reliable roof target. Verify target building before creating proposal.' }
  }

  const webhookUrl = process.env.N8N_CREATE_PROPOSAL_WEBHOOK_URL
  if (!webhookUrl) {
    return { success: false, error: 'N8N_CREATE_PROPOSAL_WEBHOOK_URL is not configured' }
  }

  const { data: job, error: jobError } = await supabase
    .from('proposal_jobs')
    .insert([{
      business_name: businessName,
      address: prospectWithVisualTarget.address,
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
        visual_zoom: prospectWithVisualTarget.visual_zoom || null,
        visual_preview_url: prospectWithVisualTarget.visual_preview_url || null,
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
      address: prospectWithVisualTarget.address,
      lat: visualTarget.lat,
      lng: visualTarget.lng,
      slug,
      prospect_id: prospectWithVisualTarget.id,
      job_id: job.id,
      visual_target: visualTarget,
      visual_zoom: prospectWithVisualTarget.visual_zoom || null,
      visual_preview_url: prospectWithVisualTarget.visual_preview_url || null,
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
        prospect_id: prospectWithVisualTarget.id,
        source: 'prospect_table',
        visual_target: visualTarget,
        visual_zoom: prospectWithVisualTarget.visual_zoom || null,
        visual_preview_url: prospectWithVisualTarget.visual_preview_url || null,
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

async function ensureVisualTargetForProposal(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  prospect: Prospect,
): Promise<Prospect> {
  if (
    prospect.visual_verified === true &&
    typeof prospect.visual_lat === 'number' &&
    typeof prospect.visual_lng === 'number'
  ) {
    return prospect
  }

  const candidate = await resolveAutoVisualCandidate(prospect)
  if (!candidate || candidate.source !== 'google_solar_roof_center') return prospect

  const verifiedAt = new Date().toISOString()
  const note = `Auto-verified from Google Solar roof center (${candidate.reason})`
  const { error } = await supabase
    .from('prospects')
    .update({
      visual_lat: candidate.lat,
      visual_lng: candidate.lng,
      visual_verified: true,
      visual_verified_at: verifiedAt,
      visual_review_note: note,
    })
    .eq('id', prospect.id)

  if (error) {
    console.error('[pipeline] Auto visual target save failed:', error.message)
    return prospect
  }

  return {
    ...prospect,
    visual_lat: candidate.lat,
    visual_lng: candidate.lng,
    visual_verified: true,
    visual_verified_at: verifiedAt,
    visual_review_note: note,
  }
}

async function resolveAutoVisualCandidate(prospect: Prospect) {
  const existing = getProspectVisualCandidate(prospect)
  if (
    prospect.visual_verified === true &&
    existing?.source === 'saved_visual'
  ) {
    return existing
  }

  if (existing) {
    const solarCandidate = await getSolarRoofCenterCandidate(existing.lat, existing.lng)
    if (solarCandidate) return solarCandidate
  }

  return existing
}

async function getSolarRoofCenterCandidate(lat: number, lng: number) {
  const insights = await fetchSolarInsights(lat, lng).catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[pipeline] Auto visual target solar lookup failed: ${message}`)
    return null
  })

  const center = insights?.center
  if (typeof center?.latitude !== 'number' || typeof center.longitude !== 'number') return null

  const driftMeters = distanceMeters(lat, lng, center.latitude, center.longitude)
  const panelCount = insights?.solarPotential?.maxArrayPanelsCount || insights?.solarPotential?.solarPanels?.length || 0
  const roofAreaMeters = insights?.solarPotential?.maxArrayAreaMeters2 || 0
  const looksCommercial = panelCount >= MIN_AUTO_SOLAR_PANEL_COUNT || roofAreaMeters >= MIN_AUTO_SOLAR_AREA_METERS

  if (driftMeters > MAX_AUTO_SOLAR_CENTER_DRIFT_METERS || !looksCommercial) {
    console.log('[pipeline] Auto visual target rejected', {
      driftMeters: Math.round(driftMeters),
      panelCount,
      roofAreaMeters: Math.round(roofAreaMeters),
      looksCommercial,
    })
    return null
  }

  return {
    lat: center.latitude,
    lng: center.longitude,
    source: 'google_solar_roof_center' as const,
    reason: `${Math.round(driftMeters)}m drift, ${panelCount} panels, ${Math.round(roofAreaMeters)}m2 roof`,
  }
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earthRadiusMeters = 6371000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const deltaLat = toRadians(bLat - aLat)
  const deltaLng = toRadians(bLng - aLng)
  const lat1 = toRadians(aLat)
  const lat2 = toRadians(bLat)
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
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

function clampZoom(value: unknown) {
  const zoom = Number(value)
  if (!Number.isFinite(zoom)) return 19
  return Math.min(Math.max(Math.round(zoom), 16), 21)
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
