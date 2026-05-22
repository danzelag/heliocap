import { revalidatePath } from 'next/cache'
import { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import {
  buildDefaultVeoCinematicPrompt,
  downloadVertexVeoVideo,
  fetchVertexVeoStatus,
  submitVertexVeoRender,
} from '@/lib/vertex-veo'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'
import { uploadLeadAsset, type VisualReferenceSet } from '@/lib/openclaw-google'

const DEFAULT_SITE_URL = 'https://heliocap.vercel.app'

export type ProposalVideoReferenceSet = VisualReferenceSet & {
  solarPanelRenderUrl: string | null
}

export type ProposalVideoJob = {
  id: string
  business_name: string
  address: string
  slug: string
  receipt: Record<string, unknown> | null
  proposal_url?: string | null
}

type StartProposalVideoRenderArgs = {
  supabase: SupabaseClient
  job: ProposalVideoJob
  leadId: string
  prospectId?: string | null
  referenceSet: ProposalVideoReferenceSet
}

type FinalizeProposalVideoArgs = {
  supabase: SupabaseClient
  job: ProposalVideoJob
  operationName: string
  leadId?: string | null
  prospectId?: string | null
  recordPendingEvent?: boolean
}

type PrimaryVeoReference = {
  source: string
  url: string
  buffer?: Buffer
  mimeType?: string
}

export async function startProposalVideoRender({
  supabase,
  job,
  leadId,
  prospectId,
  referenceSet,
}: StartProposalVideoRenderArgs) {
  await updateProposalJobProgress(supabase, {
    jobId: job.id,
    businessName: job.business_name,
    status: 'running',
    step: 'Reference image uploaded',
    progressPercent: 86,
    receipt: mergeReceipt(job.receipt, {
      build_status: 'video_rendering',
      build_status_label: 'Rendering Video',
      video_required: true,
      video_complete: false,
      reference_set: referenceSet,
      visual_references: referenceSet,
      updated_at: new Date().toISOString(),
    }),
  })

  const primaryReference = selectPrimaryVeoReference(referenceSet)
  if (!primaryReference.url && !primaryReference.buffer) {
    throw new Error('Veo render requires a proposal image, solar panel render, map tile, aerial, or Street View reference')
  }

  const prompt = buildDefaultVeoCinematicPrompt(job.address, describeReferenceSet(referenceSet))
  const { operationName } = await submitVertexVeoRender({
    slug: job.slug,
    prompt,
    imageUrl: primaryReference.buffer ? undefined : primaryReference.url,
    imageBuffer: primaryReference.buffer,
    imageMimeType: primaryReference.mimeType,
  })

  const receipt = mergeReceipt(job.receipt, {
    build_status: 'video_rendering',
    build_status_label: 'Rendering Video',
    video_required: true,
    video_complete: false,
    veo_operation_name: operationName,
    veo_reference_source: primaryReference.source,
    reference_set: referenceSet,
    visual_references: referenceSet,
    updated_at: new Date().toISOString(),
  })
  job.receipt = receipt

  await updateProposalJobProgress(supabase, {
    jobId: job.id,
    businessName: job.business_name,
    status: 'running',
    step: 'Veo render submitted',
    progressPercent: 90,
    receipt,
  })

  return finalizeProposalVideoIfReady({
    supabase,
    job,
    operationName,
    leadId,
    prospectId,
    recordPendingEvent: true,
  })
}

export async function finalizeProposalVideoIfReady({
  supabase,
  job,
  operationName,
  leadId,
  prospectId,
  recordPendingEvent = false,
}: FinalizeProposalVideoArgs) {
  const status = await fetchVertexVeoStatus(operationName)

  if (status.raw.error) {
    throw new Error(
      `Vertex Veo operation error: ${status.raw.error.message ?? status.raw.error.status ?? status.raw.error.code}`,
    )
  }

  if (!status.done) {
    const receipt = mergeReceipt(job.receipt, {
      build_status: 'video_rendering',
      build_status_label: 'Rendering Video',
      video_required: true,
      video_complete: false,
      veo_operation_name: operationName,
      veo_gcs_uri: status.gcsUri,
      veo_video_url: status.videoUrl,
      veo_last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    job.receipt = receipt

    if (recordPendingEvent) {
      await updateProposalJobProgress(supabase, {
        jobId: job.id,
        businessName: job.business_name,
        status: 'running',
        step: 'Veo render processing',
        progressPercent: 92,
        receipt,
      })
    }

    return {
      done: false,
      operationName,
      videoUrl: null as string | null,
    }
  }

  await updateProposalJobProgress(supabase, {
    jobId: job.id,
    businessName: job.business_name,
    status: 'running',
    step: 'Downloading Veo video',
    progressPercent: 96,
    receipt: mergeReceipt(job.receipt, {
      build_status: 'video_complete',
      build_status_label: 'Video Complete',
      video_required: true,
      video_complete: true,
      veo_operation_name: operationName,
      updated_at: new Date().toISOString(),
    }),
  })

  const videoBuffer = await downloadVertexVeoVideo(operationName)
  const videoUrl = await uploadLeadAsset({
    supabase,
    bucket: 'leads',
    slug: job.slug,
    fileName: 'video.mp4',
    body: videoBuffer,
    contentType: 'video/mp4',
  })

  const videoReceivedReceipt = mergeReceipt(job.receipt, {
    build_status: 'video_received',
    build_status_label: 'Video Received',
    video_required: true,
    video_complete: true,
    video_url: videoUrl,
    veo_operation_name: operationName,
    updated_at: new Date().toISOString(),
  })
  job.receipt = videoReceivedReceipt

  await updateProposalJobProgress(supabase, {
    jobId: job.id,
    businessName: job.business_name,
    status: 'running',
    step: 'Video received',
    progressPercent: 98,
    receipt: videoReceivedReceipt,
  })

  const proposalUrl = job.proposal_url || getProposalUrl(job.slug)

  const leadUpdate = leadId
    ? supabase.from('leads').update({ video_url: videoUrl }).eq('id', leadId)
    : supabase.from('leads').update({ video_url: videoUrl }).eq('slug', job.slug)
  const { error: leadError } = await leadUpdate
  if (leadError) throw leadError

  if (prospectId) {
    const { error: prospectError } = await supabase
      .from('prospects')
      .update({
        video_url: videoUrl,
        pipeline_stage: 'microsite_live',
      })
      .eq('id', prospectId)

    if (prospectError) throw prospectError
  }

  const receipt = mergeReceipt(job.receipt, {
    build_status: 'proposal_published',
    build_status_label: 'Proposal Ready',
    video_required: true,
    video_complete: true,
    video_url: videoUrl,
    veo_operation_name: operationName,
    proposal_url: proposalUrl,
    updated_at: new Date().toISOString(),
  })
  job.receipt = receipt

  await updateProposalJobProgress(supabase, {
    jobId: job.id,
    businessName: job.business_name,
    status: 'completed',
    step: 'Proposal published',
    progressPercent: 100,
    proposalUrl,
    leadId: leadId || undefined,
    receipt,
  })

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  revalidatePath(`/proposal/${job.slug}`)

  return {
    done: true,
    operationName,
    videoUrl,
  }
}

export function getVeoOperationName(receipt: Record<string, unknown> | null | undefined) {
  return getString(receipt?.veo_operation_name ?? receipt?.operationName ?? receipt?.operation_name)
}

export function getVideoProspectId(receipt: Record<string, unknown> | null | undefined) {
  return getString(receipt?.prospect_id ?? receipt?.prospectId)
}

export function getVideoLeadId(job: { lead_id?: string | null; receipt?: Record<string, unknown> | null }) {
  return getString(job.lead_id ?? job.receipt?.lead_id ?? job.receipt?.leadId)
}

function buildVeoReferenceBoard(referenceSet: ProposalVideoReferenceSet): Promise<PrimaryVeoReference | null> {
  if (referenceSet.solarPanelRenderUrl) {
    return Promise.resolve(null)
  }

  const candidates = [
    referenceSet.cleanedPreviewImageUrl,
    referenceSet.mapTilesImageUrl,
    referenceSet.solarApiLayoutImageUrl,
    isLikelyImageUrl(referenceSet.aerialViewReferenceUrl) ? referenceSet.aerialViewReferenceUrl : null,
    ...referenceSet.streetViewReferenceUrls,
  ]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, 4)

  if (candidates.length < 2) return Promise.resolve(null)

  return buildReferenceBoardFromUrls(candidates)
}

async function buildReferenceBoardFromUrls(candidates: string[]): Promise<PrimaryVeoReference | null> {
  try {
    const tiles = await Promise.all(candidates.map(downloadReferenceTile))
    const composites = await Promise.all(tiles.map(async (buffer, index) => ({
      input: await sharp(buffer)
        .resize(640, 360, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 88 })
        .toBuffer(),
      left: index % 2 === 0 ? 0 : 640,
      top: index < 2 ? 0 : 360,
    })))

    const board = await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: '#0c0a09',
      },
    })
      .composite(composites)
      .jpeg({ quality: 90 })
      .toBuffer()

    return {
      source: 'combined_google_maps_reference_board',
      url: '',
      buffer: board,
      mimeType: 'image/jpeg',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[proposal-video-workflow] Reference board build failed: ${message}`)
    return null
  }
}

async function downloadReferenceTile(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`reference image returned ${response.status}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

function selectPrimaryVeoReference(referenceSet: ProposalVideoReferenceSet): PrimaryVeoReference {
  if (referenceSet.solarPanelRenderUrl) {
    return { source: 'solarPanelRenderUrl', url: referenceSet.solarPanelRenderUrl }
  }

  if (referenceSet.cleanedPreviewImageUrl) {
    return { source: 'cleanedPreviewImageUrl', url: referenceSet.cleanedPreviewImageUrl }
  }

  if (referenceSet.mapTilesImageUrl) {
    return { source: 'staticSatelliteImageUrl', url: referenceSet.mapTilesImageUrl }
  }

  if (referenceSet.solarApiLayoutImageUrl) {
    return { source: 'solarApiLayoutImageUrl', url: referenceSet.solarApiLayoutImageUrl }
  }

  if (isLikelyImageUrl(referenceSet.aerialViewReferenceUrl)) {
    return { source: 'aerialViewReferenceUrl', url: referenceSet.aerialViewReferenceUrl || '' }
  }

  const streetViewImage = referenceSet.streetViewReferenceUrls.find(Boolean)
  if (streetViewImage) {
    return { source: 'streetViewReferenceUrls', url: streetViewImage }
  }

  return { source: '', url: '' }
}

function describeReferenceSet(referenceSet: ProposalVideoReferenceSet) {
  const labels = [
    referenceSet.solarPanelRenderUrl ? 'Google Solar black-panel reference image with proposed array geometry' : null,
    referenceSet.cleanedPreviewImageUrl ? 'premium proposal seed frame' : null,
    referenceSet.mapTilesImageUrl ? 'Google Static Maps top-down roof image' : null,
    referenceSet.solarApiLayoutImageUrl ? 'Google Solar roof reference' : null,
    referenceSet.aerialViewReferenceUrl ? 'Google Aerial View identity reference' : null,
    referenceSet.streetViewReferenceUrls.length
      ? `${referenceSet.streetViewReferenceUrls.length} Google Street View facade references`
      : null,
  ].filter(Boolean)

  return labels.join(', ')
}

function mergeReceipt(current: Record<string, unknown> | null | undefined, next: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries({
      ...(current || {}),
      ...next,
      engine: 'app',
    }).filter(([, value]) => value !== undefined),
  )
}

function getProposalUrl(slug: string) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '')
  return `${siteUrl}/proposal/${slug}`
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isLikelyImageUrl(value: unknown) {
  return typeof value === 'string' && /\.(png|jpe?g|webp)(\?|#|$)/i.test(value.trim())
}
