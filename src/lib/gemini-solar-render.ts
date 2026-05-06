import sharp from 'sharp'

const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'
const DEFAULT_TIMEOUT_MS = 45_000
const PREVIEW_WIDTH = 1280
const PREVIEW_HEIGHT = 720

const PREMIUM_SOLAR_RENDER_PROMPT = `Create a premium 16:9 architectural aerial visualization of a commercial rooftop solar installation.

Use the first image only as the real site reference for roof shape, building footprint, roads, grass, shadows, and surrounding context.
If a second image is provided, use it only as a rough technical guide for where solar panels belong. Do not copy its flat overlay style, dots, strokes, grid texture, colors, labels, or map-user-interface look.

The final image should feel like a polished commercial development render created for an executive solar proposal, not a Google Maps screenshot.
Re-render the entire scene with improved image quality, cleaner light, better contrast, crisp roof edges, subtle atmospheric depth, and natural-looking shadows.
Keep the property recognizable and preserve the building geometry, driveway layout, nearby roads, and major site features.
Add realistic dark blue and black solar panels aligned in clean professional rows across practical usable roof areas.
Leave setbacks, HVAC zones, parapet edges, access aisles, and maintenance corridors clear.
Do not place panels on parking lots, roads, trees, grass, vehicles, facade walls, roof edges, or irregular unusable areas.
Panels must have believable perspective, subtle reflection, depth, and soft contact shadows so they look installed rather than pasted on.
Avoid the appearance of satellite map tiles, over-sharpened map texture, flat decals, dotted panel acne, neon outlines, labels, UI controls, or HUD graphics.
Do not add text, people, vehicles, logos, icons, labels, pins, watermarks, borders, or interface elements.
Return only the final image.`

export type PremiumSolarRenderSource = 'ai_generated' | 'fallback_roof_image'

export type ImageAsset = {
  buffer: Buffer
  mimeType: string
}

export type GeneratePremiumSolarRenderOptions = {
  roofImageUrl: string
  renderImageUrl?: string | null
  timeoutMs?: number
}

type GeminiInlineData = {
  data?: string
  mimeType?: string
  mime_type?: string
}

type GeminiPart = {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
}

export async function generatePremiumSolarRender({
  roofImageUrl,
  renderImageUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: GeneratePremiumSolarRenderOptions): Promise<ImageAsset> {
  return withTimeout(timeoutMs, async (signal) => {
    const [roofAsset, guideAsset] = await Promise.all([
      fetchImageAsset(roofImageUrl, signal),
      renderImageUrl ? fetchImageAsset(renderImageUrl, signal).catch(() => null) : Promise.resolve(null),
    ])
    const aiRender = await generateGeminiImage({ roofAsset, guideAsset, signal })

    const previewBuffer = await sharp(aiRender.buffer)
      .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, { fit: 'cover', position: 'center' })
      .sharpen()
      .webp({ quality: 88, effort: 4 })
      .toBuffer()

    return {
      buffer: previewBuffer,
      mimeType: 'image/webp',
    }
  })
}

async function generateGeminiImage({
  roofAsset,
  guideAsset,
  signal,
}: {
  roofAsset: ImageAsset
  guideAsset: ImageAsset | null
  signal: AbortSignal
}) {
  const apiKey = getGoogleImageApiKey()
  const model = getGeminiImageModel()
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  const response = await postGeminiRequest({
    endpoint,
    apiKey,
    roofAsset,
    guideAsset,
    signal,
    includeResponseModalities: true,
  })

  if (response.ok) {
    return parseGeminiImageResponse(await response.text())
  }

  const responseText = await response.text()
  if (response.status === 400) {
    const retry = await postGeminiRequest({
      endpoint,
      apiKey,
      roofAsset,
      guideAsset,
      signal,
      includeResponseModalities: false,
    })
    const retryText = await retry.text()
    if (retry.ok) {
      return parseGeminiImageResponse(retryText)
    }
    throw new Error(`Gemini image generation failed: ${retry.status} ${retryText.slice(0, 240)}`)
  }

  throw new Error(`Gemini image generation failed: ${response.status} ${responseText.slice(0, 240)}`)
}

async function postGeminiRequest({
  endpoint,
  apiKey,
  roofAsset,
  guideAsset,
  signal,
  includeResponseModalities,
}: {
  endpoint: string
  apiKey: string
  roofAsset: ImageAsset
  guideAsset: ImageAsset | null
  signal: AbortSignal
  includeResponseModalities: boolean
}) {
  const parts: GeminiPart[] = [
    { text: PREMIUM_SOLAR_RENDER_PROMPT },
    {
      inline_data: {
        mime_type: roofAsset.mimeType,
        data: roofAsset.buffer.toString('base64'),
      },
    },
  ]

  if (guideAsset) {
    parts.push({
      inline_data: {
        mime_type: guideAsset.mimeType,
        data: guideAsset.buffer.toString('base64'),
      },
    })
  }

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        ...(includeResponseModalities ? { responseModalities: ['TEXT', 'IMAGE'] } : {}),
        imageConfig: {
          aspectRatio: '16:9',
        },
      },
    }),
    cache: 'no-store',
    signal,
  })
}

async function fetchImageAsset(url: string, signal: AbortSignal): Promise<ImageAsset> {
  const response = await fetch(assertFetchableAssetUrl(url), { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`Failed to fetch image asset: ${response.status}`)
  }

  const rawMimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const buffer = Buffer.from(await response.arrayBuffer())

  if (rawMimeType === 'image/svg+xml') {
    return {
      buffer: await sharp(buffer)
        .resize(PREVIEW_WIDTH, PREVIEW_HEIGHT, { fit: 'cover', position: 'center' })
        .png()
        .toBuffer(),
      mimeType: 'image/png',
    }
  }

  return {
    buffer,
    mimeType: normalizeImageMimeType(rawMimeType),
  }
}

function parseGeminiImageResponse(responseText: string): ImageAsset {
  const payload = JSON.parse(responseText) as GeminiGenerateContentResponse
  const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || []
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data)
  const inlineData = imagePart?.inlineData || imagePart?.inline_data

  if (!inlineData?.data) {
    const text = parts.map((part) => part.text).filter(Boolean).join(' ')
    throw new Error(`Gemini did not return image data${text ? `: ${text.slice(0, 240)}` : ''}`)
  }

  return {
    buffer: Buffer.from(inlineData.data, 'base64'),
    mimeType: normalizeImageMimeType(inlineData.mimeType || inlineData.mime_type),
  }
}

async function withTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await task(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Gemini image generation timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function getGeminiImageModel() {
  return process.env.GEMINI_IMAGE_MODEL || DEFAULT_GEMINI_IMAGE_MODEL
}

function getGoogleImageApiKey() {
  const key = process.env.GEMINI_API_KEY

  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  return key
}

function normalizeImageMimeType(value?: string | null) {
  const mimeType = value?.split(';')[0]?.trim().toLowerCase()
  if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp') {
    return mimeType
  }

  return 'image/png'
}

function assertFetchableAssetUrl(value: string) {
  const url = new URL(value)
  const hostname = url.hostname.toLowerCase()

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Asset URLs must use http or https')
  }
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.local') ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    throw new Error('Private asset URLs are not allowed')
  }

  return url
}
