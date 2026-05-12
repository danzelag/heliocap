import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { buildDefaultVeoCinematicPrompt, submitVertexVeoRender } from '@/lib/vertex-veo'

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
  aerialViewReferenceUrl?: unknown
  aerial_view_reference_url?: unknown
  streetViewReferenceUrls?: unknown
  street_view_reference_urls?: unknown
  referenceSet?: unknown
  reference_set?: unknown
}

type VisualReferenceSet = {
  mapTilesImageUrl: string | null
  aerialViewReferenceUrl: string | null
  streetViewReferenceUrls: string[]
  cleanedPreviewImageUrl: string | null
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as SubmitVeoBody
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const address = getFirstString(body.formattedAddress, body.formatted_address, body.address)
    const receiptReferences = slug ? await findReceiptReferences(slug) : emptyReferenceSet()
    const bodyReferences = extractReferenceSet(body)
    const referenceSet = mergeReferenceSets(receiptReferences, bodyReferences)
    const primaryReference = selectPrimaryVeoReference(referenceSet)
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
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'imageUrl or render_preview_url is required' },
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
      url: imageUrl,
    })

    if (process.env.NODE_ENV !== 'production') {
      console.log('[api/veo/submit] final Veo prompt', prompt)
    }

    const result = await submitVertexVeoRender({ slug, prompt, imageUrl })

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
      return value.trim()
    }
  }

  return ''
}

function extractReferenceSet(body: SubmitVeoBody): VisualReferenceSet {
  const referenceSet = getRecord(body.referenceSet) || getRecord(body.reference_set) || {}

  return {
    mapTilesImageUrl:
      getFirstString(body.mapTilesImageUrl, body.map_tiles_image_url, referenceSet.mapTilesImageUrl),
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
      mapTilesImageUrl: getFirstString(visualReferences.mapTilesImageUrl),
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
    mapTilesImageUrl: preferred.mapTilesImageUrl || fallback.mapTilesImageUrl,
    aerialViewReferenceUrl: preferred.aerialViewReferenceUrl || fallback.aerialViewReferenceUrl,
    streetViewReferenceUrls: preferred.streetViewReferenceUrls.length
      ? preferred.streetViewReferenceUrls
      : fallback.streetViewReferenceUrls,
    cleanedPreviewImageUrl: preferred.cleanedPreviewImageUrl || fallback.cleanedPreviewImageUrl,
  }
}

function selectPrimaryVeoReference(referenceSet: VisualReferenceSet) {
  if (referenceSet.cleanedPreviewImageUrl) {
    return { source: 'cleanedPreviewImageUrl', url: referenceSet.cleanedPreviewImageUrl }
  }

  if (isLikelyImageUrl(referenceSet.aerialViewReferenceUrl)) {
    return { source: 'aerialViewReferenceUrl', url: referenceSet.aerialViewReferenceUrl || '' }
  }

  if (referenceSet.mapTilesImageUrl) {
    return { source: 'mapTilesImageUrl', url: referenceSet.mapTilesImageUrl }
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
    referenceSet.aerialViewReferenceUrl ? 'Google Aerial View identity reference' : null,
    referenceSet.streetViewReferenceUrls.length
      ? `${referenceSet.streetViewReferenceUrls.length} Google Street View facade references`
      : null,
  ].filter(Boolean)

  return labels.join(', ')
}

function emptyReferenceSet(): VisualReferenceSet {
  return {
    mapTilesImageUrl: null,
    aerialViewReferenceUrl: null,
    streetViewReferenceUrls: [],
    cleanedPreviewImageUrl: null,
  }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function getFirstStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
}

function isLikelyImageUrl(value: unknown) {
  return typeof value === 'string' && /\.(png|jpe?g|webp)(\?|#|$)/i.test(value)
}
