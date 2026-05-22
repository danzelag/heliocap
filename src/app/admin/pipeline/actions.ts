'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'
import {
  clampVisualZoom,
  getExcludedReferenceUrls,
  getProspectStoragePathFromPublicUrl,
} from '@/lib/prospect-admin'
import {
  buildProspectSolarApiLayoutReference,
  collectProspectVisualReferences,
  fetchProspectSolarRgbReference,
  getProspectSolarCapability,
  resolveAutoVisualCandidate,
} from '@/lib/prospect-visual'
import { prospectStages, resolveProspectVisualTarget, type Prospect, type ProspectStage } from '@/lib/prospect'
import { recordProposalJobEvent } from '@/lib/proposal-job-events'
import { runInAppProposalWorkflow } from '@/lib/proposal-workflow'
import {
  fetchStreetViewImage,
  uploadLeadAsset,
} from '@/lib/openclaw-google'

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
    const previewZoom = clampVisualZoom(zoom)
    const solarRgb = await fetchProspectSolarRgbReference({
      supabase,
      id,
      lat: candidate.lat,
      lng: candidate.lng,
    })

    return {
      success: true,
      imageDataUrl: solarRgb.url,
      lat: candidate.lat,
      lng: candidate.lng,
      zoom: previewZoom,
      source: 'google_solar_rgb',
    }
  } catch (previewError) {
    const message = previewError instanceof Error ? previewError.message : 'Failed to load Solar API RGB imagery.'
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
  const visualZoom = clampVisualZoom(zoom)
  let visualPreviewUrl: string | null = null

  try {
    const solarRgb = await fetchProspectSolarRgbReference({
      supabase,
      id,
      lat,
      lng,
    })
    visualPreviewUrl = solarRgb.url
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[pipeline] Solar RGB target preview save failed: ${message}`)
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

export async function getProspectVisualReferencesAction(id: string, lat?: number, lng?: number) {
  if (!id) return { success: false, error: 'Missing prospect ID' }

  const requestedLat = Number(lat)
  const requestedLng = Number(lng)
  if (!Number.isFinite(requestedLat) || !Number.isFinite(requestedLng)) {
    return { success: false, error: 'Enter valid latitude and longitude first.' }
  }

  const supabase = await createAdminClient()
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('id,address,visual_preview_url,visual_reference_exclusions,solar_reference_enabled,solar_reference_lat,solar_reference_lng,solar_reference_zoom,solar_reference_url')
    .eq('id', id)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!prospect) return { success: false, error: 'Prospect not found' }

  try {
    const {
      filteredReferenceSet,
      excludedUrls,
      referenceCards,
    } = await collectProspectVisualReferences({
      supabase,
      prospect,
      lat: requestedLat,
      lng: requestedLng,
    })
    await removeExcludedProspectReferenceFiles(supabase, excludedUrls)

    return {
      success: true,
      reference_set: filteredReferenceSet,
      referenceCards,
      mapTilesImageUrl: filteredReferenceSet.mapTilesImageUrl,
      aerialViewReferenceUrl: filteredReferenceSet.aerialViewReferenceUrl,
      streetViewReferenceUrls: filteredReferenceSet.streetViewReferenceUrls,
      solarApiLayoutImageUrl: filteredReferenceSet.solarApiLayoutImageUrl || null,
      solarReferenceEnabled: prospect.solar_reference_enabled !== false,
      solarReferenceLat: prospect.solar_reference_lat ?? requestedLat,
      solarReferenceLng: prospect.solar_reference_lng ?? requestedLng,
      solarReferenceZoom: prospect.solar_reference_zoom ?? null,
    }
  } catch (referenceError) {
    const message = referenceError instanceof Error ? referenceError.message : 'Failed to collect visual references.'
    return { success: false, error: message }
  }
}

export async function saveProspectSolarReferenceAction({
  id,
  lat,
  lng,
  zoom,
  enabled,
}: {
  id: string
  lat: number
  lng: number
  zoom?: number
  enabled: boolean
}) {
  if (!id) return { success: false, error: 'Missing prospect ID' }

  const supabase = await createAdminClient()
  if (!enabled) {
    const { error } = await supabase
      .from('prospects')
      .update({
        solar_reference_enabled: false,
        solar_reference_updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) return { success: false, error: error.message }

    revalidatePath('/admin')
    revalidatePath('/admin/pipeline')
    return { success: true, enabled: false, url: null }
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { success: false, error: 'Enter valid Solar API reference latitude and longitude.' }
  }

  const url = await buildProspectSolarApiLayoutReference({
    supabase,
    id,
    lat,
    lng,
    zoom,
  })
  if (!url) return { success: false, error: 'Google Solar API did not return roof imagery for this location.' }

  const { data: prospect } = await supabase
    .from('prospects')
    .select('visual_reference_exclusions')
    .eq('id', id)
    .maybeSingle()
  const exclusions = getExcludedReferenceUrls(prospect?.visual_reference_exclusions).filter((excludedUrl) => excludedUrl !== url)
  await supabase
    .from('prospects')
    .update({
      visual_reference_exclusions: exclusions,
      solar_reference_enabled: true,
    })
    .eq('id', id)

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  return { success: true, enabled: true, url }
}

export async function saveProspectStreetViewCaptureAction({
  id,
  pano,
  lat,
  lng,
  heading,
  pitch,
  fov,
}: {
  id: string
  pano?: string | null
  lat?: number | null
  lng?: number | null
  heading: number
  pitch: number
  fov: number
}) {
  if (!id) return { success: false, error: 'Missing prospect ID' }
  if (!Number.isFinite(heading)) return { success: false, error: 'Street View heading is required.' }

  const supabase = await createAdminClient()
  try {
    const image = await fetchStreetViewImage({ pano, lat, lng, heading, pitch, fov })
    const publicUrl = await uploadLeadAsset({
      supabase,
      bucket: 'prospects',
      slug: id,
      fileName: `references/manual-street-view-${Date.now()}.jpg`,
      body: image.buffer,
      contentType: image.contentType,
    })

    return {
      success: true,
      url: publicUrl,
      referenceCard: {
        id: `manual-street-view-${Date.now()}`,
        label: 'Manual Street View capture',
        type: 'Manually aimed facade reference',
        url: publicUrl,
        unavailableReason: null,
      },
    }
  } catch (captureError) {
    const message = captureError instanceof Error ? captureError.message : 'Failed to save Street View capture.'
    return { success: false, error: message }
  }
}

export async function getProspectSolarCapabilityAction(id: string, lat?: number, lng?: number) {
  if (!id) {
    return { success: false, error: 'Missing prospect ID', building: null, roofSegments: [], dataLayers: null }
  }

  const requestedLat = Number(lat)
  const requestedLng = Number(lng)
  if (!Number.isFinite(requestedLat) || !Number.isFinite(requestedLng)) {
    return {
      success: false,
      error: 'Enter valid latitude and longitude first.',
      building: null,
      roofSegments: [],
      dataLayers: null,
    }
  }

  const supabase = await createAdminClient()
  return getProspectSolarCapability({
    supabase,
    id,
    lat: requestedLat,
    lng: requestedLng,
  })
}

export async function deleteProspectVisualReferenceAction({
  id,
  url,
}: {
  id: string
  url: string
}) {
  if (!id) return { success: false, error: 'Missing prospect ID' }
  if (!url) return { success: false, error: 'Missing reference URL' }

  const supabase = await createAdminClient()
  const storagePath = getProspectStoragePathFromPublicUrl(url)
  if (!storagePath || !storagePath.startsWith(`${id}/`)) {
    return { success: false, error: 'This reference is not a deletable prospect storage image.' }
  }

  const { error } = await supabase.storage.from('prospects').remove([storagePath])
  if (error) return { success: false, error: error.message }

  const { data: prospect } = await supabase
    .from('prospects')
    .select('visual_preview_url,satellite_url,render_url,render_preview_url,visual_reference_exclusions,solar_reference_url')
    .eq('id', id)
    .maybeSingle()
  const update: Record<string, unknown> = {
    visual_reference_exclusions: [...new Set([...getExcludedReferenceUrls(prospect?.visual_reference_exclusions), url])],
  }
  if (prospect?.visual_preview_url === url || storagePath === `${id}/visual-target.png`) {
    update.visual_preview_url = null
  }
  if (prospect?.satellite_url === url) update.satellite_url = null
  if (prospect?.render_url === url) update.render_url = null
  if (prospect?.render_preview_url === url) update.render_preview_url = null
  if (prospect?.solar_reference_url === url || storagePath === `${id}/references/solar-api-layout.webp`) {
    update.solar_reference_url = null
  }

  const { error: updateError } = await supabase
    .from('prospects')
    .update(update)
    .eq('id', id)
  if (updateError) return { success: false, error: updateError.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  return { success: true, deletedPath: storagePath }
}

async function removeExcludedProspectReferenceFiles(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  excludedUrls: string[],
) {
  const paths = excludedUrls
    .map(getProspectStoragePathFromPublicUrl)
    .filter((path): path is string => Boolean(path))

  if (!paths.length) return
  const { error } = await supabase.storage.from('prospects').remove(paths)
  if (error) console.error(`[pipeline] Failed to remove excluded references: ${error.message}`)
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

  const solarReferenceUrl = prospectWithVisualTarget.solar_reference_enabled === false
    ? null
    : prospectWithVisualTarget.solar_reference_url || null
  const visualReferenceExclusions = getExcludedReferenceUrls(prospectWithVisualTarget.visual_reference_exclusions)

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
        solarApiLayoutImageUrl: solarReferenceUrl,
        visual_reference_exclusions: visualReferenceExclusions,
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

  await supabase
    .from('proposal_jobs')
    .update({
      status: 'running',
      current_step: 'App workflow starting',
      progress_percent: 8,
      receipt: {
        prospect_id: prospectWithVisualTarget.id,
        source: 'prospect_table',
        engine: 'app',
        build_status: 'processing',
        build_status_label: 'Processing',
        visual_target: visualTarget,
        visual_zoom: prospectWithVisualTarget.visual_zoom || null,
        visual_preview_url: prospectWithVisualTarget.visual_preview_url || null,
        solarApiLayoutImageUrl: solarReferenceUrl,
        visual_reference_exclusions: visualReferenceExclusions,
      },
    })
    .eq('id', job.id)
  await recordProposalJobEvent(supabase, {
    jobId: job.id,
    businessName,
    status: 'running',
    step: 'App workflow starting',
    progressPercent: 8,
  })
  after(() => runInAppProposalWorkflow(job.id))

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

export async function clearProposalQueueAction() {
  const supabase = await createAdminClient()
  const staleCutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString()

  const { data: finishedJobs, error: finishedFetchError } = await supabase
    .from('proposal_jobs')
    .select('id')
    .in('status', ['completed', 'failed'])

  if (finishedFetchError) return { success: false, error: finishedFetchError.message }

  const { data: staleJobs, error: staleFetchError } = await supabase
    .from('proposal_jobs')
    .select('id')
    .eq('status', 'running')
    .lt('updated_at', staleCutoff)

  if (staleFetchError) return { success: false, error: staleFetchError.message }

  const ids = [...new Set([
    ...((finishedJobs || []).map((j) => j.id)),
    ...((staleJobs || []).map((j) => j.id)),
  ])]

  if (ids.length === 0) return { success: true, cleared: 0 }

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
