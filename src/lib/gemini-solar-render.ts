import sharp from 'sharp'
import {
  getGoogleCloudAccessToken,
  getGoogleCloudLocation,
  getGoogleCloudProjectId,
} from '@/lib/google-cloud-auth'

const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'
const DEFAULT_TIMEOUT_MS = 45_000
const PREVIEW_WIDTH = 1280
const PREVIEW_HEIGHT = 720

const PREMIUM_SOLAR_RENDER_PROMPT = `This is a strict top-down residential proposal image cleanup. The output must be the exact same residential property from the input image, not a redesigned or substituted building.

Important: do not draw solar panels. Solar panels are composited later by deterministic code from Google Solar API coordinates. This image-generation step only cleans the base satellite image.

Keep the camera as a locked top-down satellite view. Do not create a 3D render, oblique view, drone angle, cinematic flyover, perspective tilt, new house, new roof, or alternate neighborhood.

Preserve the same building footprint, roof outline, roof planes, driveway, yard, street, neighbors, lot boundaries, surrounding context, shadows, and camera angle. Do not redesign, replace, expand, simplify, or invent the building. Do not add nearby buildings, extra roads, new lots, roof sections, roof planes, fences, vehicles, people, labels, or unrelated structures.

Do not add solar panels, solar arrays, solar modules, rooftop rectangles, panel guides, colored panels, black panels, blue panels, or any proposed equipment. Do not infer where panels might go. Leave the roof clean.

Remove ALL overlays completely: Google Maps watermarks, Google logo, copyright notices, map UI controls, attribution text, compass rose, scale bar, labels, pins, borders, icons, cars, people, logos, and any other non-building artifacts. The output image must contain zero text, zero UI elements, and zero watermarks.

Improve visual quality without changing geometry: sharpen roof edges, clean muddy satellite texture, improve contrast, normalize lighting, clarify shadows, remove compression artifacts, smooth the ugly map-photo look, and make the result feel like a premium solar proposal render.

Do not beautify by inventing details. Do not turn it into a fantasy render. The output should still look like a real top-down aerial image of the exact property, just cleaner, sharper, watermark-free, and more pleasing.

Return only one clean 16:9 top-down image of the same property, suitable for deterministic solar panel compositing and a subtle 2D zoom video.`

export type PremiumSolarRenderSource = 'ai_generated' | 'executive_render' | 'fallback_roof_image'

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
      .webp({ quality: 95, effort: 6 })
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
  const accessToken = await getGoogleCloudAccessToken()
  const model = getGeminiImageModel()
  const endpoint = getVertexGeminiImageEndpoint(model)

  const response = await postGeminiRequest({
    endpoint,
    accessToken,
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
      accessToken,
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
  accessToken,
  roofAsset,
  guideAsset,
  signal,
  includeResponseModalities,
}: {
  endpoint: string
  accessToken: string
  roofAsset: ImageAsset
  guideAsset: ImageAsset | null
  signal: AbortSignal
  includeResponseModalities: boolean
}) {
  const parts: GeminiPart[] = [
    { text: PREMIUM_SOLAR_RENDER_PROMPT },
    {
      inlineData: {
        mimeType: roofAsset.mimeType,
        data: roofAsset.buffer.toString('base64'),
      },
    },
  ]

  if (guideAsset) {
    parts.push({
      inlineData: {
        mimeType: guideAsset.mimeType,
        data: guideAsset.buffer.toString('base64'),
      },
    })
  }

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: {
        role: 'USER',
        parts,
      },
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

function getVertexGeminiImageEndpoint(model: string) {
  const project = getGoogleCloudProjectId()
  const location = getGoogleCloudLocation()
  const modelResource = model.startsWith('publishers/')
    ? model
    : `publishers/google/models/${model}`

  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/${modelResource}:generateContent`
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
