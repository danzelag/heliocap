import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { buildDefaultVeoCinematicPrompt, submitVertexVeoRender } from '@/lib/vertex-veo'
import sharp from 'sharp'

type SubmitVeoBody = {
  slug?: unknown
  prompt?: unknown
  address?: unknown
  formattedAddress?: unknown
  formatted_address?: unknown
  imageUrl?: unknown
  image_url?: unknown
  renderPreviewUrl?: unknown
  render_preview_url?: unknown
  cleanedPreviewImageUrl?: unknown
  cleaned_preview_image_url?: unknown
  mapTilesImageUrl?: unknown
  map_tiles_image_url?: unknown
  solarApiLayoutImageUrl?: unknown
  solar_api_layout_image_url?: unknown
  aerialViewReferenceUrl?: unknown
  aerial_view_reference_url?: unknown
  streetViewReferenceUrls?: unknown
  street_view_reference_urls?: unknown
  referenceSet?: unknown
  reference_set?: unknown
}

type VisualReferenceSet = {
  solarPanelRenderUrl: string | null   // satellite + Solar API panel overlay raster — best Veo seed
  mapTilesImageUrl: string | null
  aerialViewReferenceUrl: string | null
  streetViewReferenceUrls: string[]
  cleanedPreviewImageUrl: string | null
  solarApiLayoutImageUrl: string | null
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as SubmitVeoBody
    const slug = getFirstString(body.slug)
    const address = getFirstString(body.formattedAddress, body.formatted_address, body.address)
    const receiptReferences = slug ? await findReceiptReferences(slug) : emptyReferenceSet()
    const bodyReferences = extractReferenceSet(body)
    const referenceSet = mergeReferenceSets(receiptReferences, bodyReferences)
    const referenceBoard = await buildVeoReferenceBoard(referenceSet)
    const primaryReference = referenceBoard || selectPrimaryVeoReference(referenceSet)
    const fallbackImageUrl = getFirstString(
      body.imageUrl,
      body.image_url,
      body.renderPreviewUrl,
      body.render_preview_url,
    )
    const imageUrl = primaryReference.url || fallbackImageUrl
    const referenceContext = describeReferenceSet(referenceSet)
    const prompt =
      typeof body.prompt === 'string' && body.prompt.trim()
        ? body.prompt.trim()
        : buildDefaultVeoCinematicPrompt(address, referenceContext)

    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }
    if (!imageUrl && !primaryReference.buffer) {
      return NextResponse.json(
        { error: 'imageUrl, render_preview_url, or visual references are required' },
        { status: 400 },
      )
    }

    console.log('[api/veo/submit] Visual references available', {
      cleanedPreview: Boolean(referenceSet.cleanedPreviewImageUrl),
      aerialView: Boolean(referenceSet.aerialViewReferenceUrl),
      aerialViewImageCompatible: isLikelyImageUrl(referenceSet.aerialViewReferenceUrl),
      mapTiles: Boolean(referenceSet.mapTilesImageUrl),
      streetViewCount: referenceSet.streetViewReferenceUrls.length,
    })
    console.log('[api/veo/submit] Primary Veo reference selected', {
      source: primaryReference.source || 'fallback_request_image',
      url: primaryReference.url || imageUrl,
      referenceBoard: Boolean(referenceBoard),
    })

    if (process.env.NODE_ENV !== 'production') {
      console.log('[api/veo/submit] final Veo prompt', prompt)
    }

    const result = await submitVertexVeoRender({
      slug,
      prompt,
      imageUrl: primaryReference.buffer ? undefined : imageUrl,
      imageBuffer: primaryReference.buffer,
      imageMimeType: primaryReference.buffer ? 'image/jpeg' : undefined,
    })

    return NextResponse.json({
      slug,
      operationName: result.operationName,
      operation_name: result.operationName,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[api/veo/submit]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return sanitizeN8nString(value)
    }
  }

  return ''
}

function sanitizeN8nString(value: string) {
  return value
    .trim()
    .replace(/^=+/, '')
    .replace(/^"+|"+$/g, '')
    .trim()
}

function extractReferenceSet(body: SubmitVeoBody): VisualReferenceSet {
  const referenceSet = getRecord(body.referenceSet) || getRecord(body.reference_set) || {}

  return {
    // solarPanelRenderUrl = the rasterized SVG overlay from generate-roof-image.
    // It has real panel geometry from Google Solar API already on the satellite image.
    // This is the ideal Veo seed — panels in the right place, no Gemini stripping.
    solarPanelRenderUrl:
      getFirstString((referenceSet as Record<string, unknown>).solarPanelRenderUrl),
    mapTilesImageUrl:
      getFirstString(body.mapTilesImageUrl, body.map_tiles_image_url, referenceSet.mapTilesImageUrl),
    solarApiLayoutImageUrl:
      getFirstString(body.solarApiLayoutImageUrl, body.solar_api_layout_image_url, referenceSet.solarApiLayoutImageUrl),
    aerialViewReferenceUrl:
      getFirstString(body.aerialViewReferenceUrl, body.aerial_view_reference_url, referenceSet.aerialViewReferenceUrl),
    streetViewReferenceUrls: getFirstStringArray(
      body.streetViewReferenceUrls ||
      body.street_view_reference_urls ||
      referenceSet.streetViewReferenceUrls,
    ),
    cleanedPreviewImageUrl:
      getFirstString(
        body.cleanedPreviewImageUrl,
        body.cleaned_preview_image_url,
        body.renderPreviewUrl,
        body.render_preview_url,
        referenceSet.cleanedPreviewImageUrl,
      ),
  }
}

async function findReceiptReferences(slug: string): Promise<VisualReferenceSet> {
  try {
    const supabase = await createAdminClient()
    const { data, error } = await supabase
      .from('proposal_jobs')
      .select('receipt')
      .eq('slug', slug)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    const receipt = data?.receipt && typeof data.receipt === 'object'
      ? data.receipt as Record<string, unknown>
      : {}
    const visualReferences = getRecord(receipt.visual_references) || getRecord(receipt.reference_set) || receipt

    return {
      solarPanelRenderUrl: getFirstString(visualReferences.solarPanelRenderUrl),
      mapTilesImageUrl: getFirstString(visualReferences.mapTilesImageUrl),
      solarApiLayoutImageUrl: getFirstString(visualReferences.solarApiLayoutImageUrl),
      aerialViewReferenceUrl: getFirstString(visualReferences.aerialViewReferenceUrl),
      streetViewReferenceUrls: getFirstStringArray(visualReferences.streetViewReferenceUrls),
      cleanedPreviewImageUrl: getFirstString(visualReferences.cleanedPreviewImageUrl),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[api/veo/submit] Reference lookup failed: ${message}`)
    return emptyReferenceSet()
  }
}

function mergeReferenceSets(
  fallback: VisualReferenceSet,
  preferred: VisualReferenceSet,
): VisualReferenceSet {
  return {
    solarPanelRenderUrl: preferred.solarPanelRenderUrl || fallback.solarPanelRenderUrl,
    mapTilesImageUrl: preferred.mapTilesImageUrl || fallback.mapTilesImageUrl,
    solarApiLayoutImageUrl: preferred.solarApiLayoutImageUrl || fallback.solarApiLayoutImageUrl,
    aerialViewReferenceUrl: preferred.aerialViewReferenceUrl || fallback.aerialViewReferenceUrl,
    streetViewReferenceUrls: preferred.streetViewReferenceUrls.length
      ? preferred.streetViewReferenceUrls
      : fallback.streetViewReferenceUrls,
    cleanedPreviewImageUrl: preferred.cleanedPreviewImageUrl || fallback.cleanedPreviewImageUrl,
  }
}

type PrimaryVeoReference = {
  source: string
  url: string
  buffer?: Buffer
}

async function buildVeoReferenceBoard(referenceSet: VisualReferenceSet): Promise<PrimaryVeoReference | null> {
  const candidates = [
    // solarPanelRenderUrl first — has real panel geometry already on the roof
    referenceSet.solarPanelRenderUrl,
    referenceSet.cleanedPreviewImageUrl,
    referenceSet.mapTilesImageUrl,
    referenceSet.solarApiLayoutImageUrl,
    isLikelyImageUrl(referenceSet.aerialViewReferenceUrl) ? referenceSet.aerialViewReferenceUrl : null,
    ...referenceSet.streetViewReferenceUrls,
  ]
    .map((url) => (typeof url === 'string' ? sanitizeN8nString(url) : ''))
    .filter((url) => /^https?:\/\//i.test(url))
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, 4)

  if (candidates.length < 2) return null

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
      source: 'combinedReferenceBoard',
      url: '',
      buffer: board,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[api/veo/submit] Reference board build failed: ${message}`)
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

function selectPrimaryVeoReference(referenceSet: VisualReferenceSet): PrimaryVeoReference {
  // solarPanelRenderUrl = satellite + real Solar API panel overlay.
  // Use this first so Veo sees panels already on the roof.
  if (referenceSet.solarPanelRenderUrl) {
    return { source: 'solarPanelRenderUrl', url: referenceSet.solarPanelRenderUrl }
  }

  if (referenceSet.cleanedPreviewImageUrl) {
    return { source: 'cleanedPreviewImageUrl', url: referenceSet.cleanedPreviewImageUrl }
  }

  if (referenceSet.mapTilesImageUrl) {
    return { source: 'mapTilesImageUrl', url: referenceSet.mapTilesImageUrl }
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

function describeReferenceSet(referenceSet: VisualReferenceSet) {
  const labels = [
    referenceSet.cleanedPreviewImageUrl ? 'cleaned no-panel preview image' : null,
    referenceSet.mapTilesImageUrl ? 'Map Tiles top-down roof image' : null,
    referenceSet.solarApiLayoutImageUrl ? 'Solar API roof reference image without panel overlays, for roof geometry and site context only' : null,
    referenceSet.aerialViewReferenceUrl ? 'Google Aerial View identity reference' : null,
    referenceSet.streetViewReferenceUrls.length
      ? `${referenceSet.streetViewReferenceUrls.length} Google Street View facade references`
      : null,
  ].filter(Boolean)

  return labels.join(', ')
}

function emptyReferenceSet(): VisualReferenceSet {
  return {
    solarPanelRenderUrl: null,
    mapTilesImageUrl: null,
    aerialViewReferenceUrl: null,
    streetViewReferenceUrls: [],
    cleanedPreviewImageUrl: null,
    solarApiLayoutImageUrl: null,
  }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getFirstStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    .map((entry) => sanitizeN8nString(entry))
}

function isLikelyImageUrl(value: unknown) {
  return typeof value === 'string' && /\.(png|jpe?g|webp)(\?|#|$)/i.test(sanitizeN8nString(value))
}
