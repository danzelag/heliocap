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

const PREMIUM_SOLAR_RENDER_PROMPT = `Create a faithful polished seed image for a commercial solar proposal video.

Use the first image as the base image, not loose inspiration. Preserve the exact target property, building footprint, roof outline, roof proportions, roof orientation, parking layout, drive aisles, lot context, adjacent roads, nearby green areas, shadows, and overall camera angle. Keep the same crop and composition unless a tiny centering correction is needed.

If a second image is provided, use it only as the solar panel layout guide. Preserve the array placement, row direction, spacing, setbacks, and usable-roof boundaries. Do not move panels onto parking lots, roads, trees, grass, facade walls, roof edges, or unusable areas.

This is an image-to-image cleanup of the same property. Do not substitute a different building. Do not redesign the building. Do not invent, expand, or add surrounding buildings, neighboring properties, extra roads, city blocks, skyline elements, unrelated structures, new entrances, new roof sections, new parking rows, or a different site.

Improve the source image quality while keeping it recognizable: reduce map compression, sharpen roof edges, clean muddy roof texture, improve contrast, clarify shadows, and make the site look premium enough to seed a cinematic Veo clip. Keep the original aerial perspective. Do not convert the scene into a new oblique/isometric 3D model if that changes the building identity.

Integrate clean dark blue or black commercial solar modules naturally into the existing roof. Panels must follow the provided layout guide when available, with believable perspective, consistent rows, subtle depth, and soft contact shadows. Keep panel placement stable and unwarped.

The output must still look like the same property from the input image at a glance. Fidelity matters more than making it look impressive.

Remove labels, UI controls, watermarks, map artifacts, compression, cars, people, logos, icons, pins, borders, and interface elements. Avoid sticker-like panels, warped panel placement, cartoon style, anime style, SimCity style, neon outlines, HUD graphics, text, or fake unrelated architecture.

Return only a polished 16:9 image of the same commercial property for Veo video generation.`

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
