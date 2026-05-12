import {
  getGoogleCloudAccessToken,
  getGoogleCloudLocation,
  getGoogleCloudProjectId,
} from '@/lib/google-cloud-auth'
import sharp from 'sharp'

const VERTEX_MODEL_RESOURCE = 'publishers/google/models/veo-3.1-generate-001'
const VEO_DURATION_SECONDS = 8

export const DEFAULT_VEO_CINEMATIC_PROMPT =
  `Image-to-video from the provided reference image only.

Create a slow cinematic aerial motion shot of the exact same commercial property shown in the input image.

Do not change the building, roof shape, building footprint, surrounding roads, parking lot, lot boundaries, or site layout. Do not invent nearby buildings. Do not use adjacent or nearby buildings. Do not replace the property with a generic building. The video must remain visually recognizable as the same input property in every frame.

Use only subtle drone-style motion: slow push-in, slight parallax, gentle tilt. Maintain the same site geometry and roof proportions.

Add solar panels only during this video step. Solar panels may appear only as clean, broad, flat, pure black or very dark charcoal rectangular rooftop arrays on the existing roof surfaces, with subtle glossy reflections. No blue panels.

Panels must be aligned in straight, clean rectangular rows parallel to the roof edges or dominant roof axis. No slanted, crooked, warped, scattered, diagonal, random, or speckled panel placement.

Do not place panels on parking lots, roads, grass, trees, facades, walls, roof edges, or neighboring properties.

No text, labels, UI, logos, cars, people, map artifacts, neon, cartoon, or HUD graphics.

Priority order:
1. Preserve the exact input building and site.
2. Keep geometry stable.
3. Add premium cinematic lighting.
4. Add clean rooftop solar arrays.`

export function buildDefaultVeoCinematicPrompt(address?: string | null) {
  const cleanAddress = address?.trim()
  if (!cleanAddress) return DEFAULT_VEO_CINEMATIC_PROMPT

  return `${DEFAULT_VEO_CINEMATIC_PROMPT}

The reference image shows the target property at: ${cleanAddress}. Preserve only the building and site shown in the reference image.`
}

type VertexImageInput = {
  gcsUri?: string
  bytesBase64Encoded?: string
  mimeType: string
}

type VeoImageAsset = {
  buffer: Buffer
  mimeType: string
}

type VertexVeoOperation = {
  name?: string
  done?: boolean
  error?: {
    code?: number
    message?: string
    status?: string
  }
  response?: {
    videos?: Array<{
      gcsUri?: string
      uri?: string
      bytesBase64Encoded?: string
      mimeType?: string
    }>
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string
          gcsUri?: string
          bytesBase64Encoded?: string
          mimeType?: string
        }
      }>
    }
    predictions?: Array<{
      uri?: string
      gcsUri?: string
      bytesBase64Encoded?: string
      video?: {
        uri?: string
        gcsUri?: string
        bytesBase64Encoded?: string
        mimeType?: string
      }
    }>
  }
}

type VertexVeoStatus = {
  done: boolean
  failed?: boolean
  videoUrl: string | null
  gcsUri: string | null
  raw: VertexVeoOperation
}

export async function submitVertexVeoRender({
  slug,
  prompt,
  imageUrl,
  imageBuffer,
  imageMimeType,
}: {
  slug?: string
  prompt: string
  imageUrl?: string
  imageBuffer?: Buffer
  imageMimeType?: string
}): Promise<{ slug?: string; operationName: string }> {
  const project = getGoogleCloudProjectId()
  const storageUri = getRequiredVeoEnv('GOOGLE_CLOUD_STORAGE_URI')
  const accessToken = await getGoogleCloudAccessToken()
  const image = await buildImageInput({ imageUrl, imageBuffer, imageMimeType })

  const res = await fetch(`${getPublisherModelUrl(project)}:predictLongRunning`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      instances: [
        {
          prompt,
          image,
        },
      ],
      parameters: {
        storageUri,
        sampleCount: 1,
        aspectRatio: '16:9',
        durationSeconds: VEO_DURATION_SECONDS,
        personGeneration: 'disallow',
      },
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vertex Veo submit failed: ${res.status} ${text.slice(0, 400)}`)
  }

  const data = (await res.json()) as VertexVeoOperation
  if (!data.name) {
    throw new Error('Vertex Veo submit: no operation name in response')
  }

  return { slug, operationName: data.name }
}

export async function fetchVertexVeoStatus(operationName: string): Promise<VertexVeoStatus> {
  const project = getGoogleCloudProjectId()
  const accessToken = await getGoogleCloudAccessToken()

  const res = await fetch(`${getPublisherModelUrl(project)}:fetchPredictOperation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ operationName }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vertex Veo status failed: ${res.status} ${text.slice(0, 400)}`)
  }

  const raw = (await res.json()) as VertexVeoOperation
  const refs = extractVideoRefs(raw)

  return {
    done: raw.done === true,
    failed: Boolean(raw.error),
    videoUrl: refs.videoUrl,
    gcsUri: refs.gcsUri,
    raw,
  }
}

export async function downloadVertexVeoVideo(operationName: string): Promise<Buffer> {
  const status = await fetchVertexVeoStatus(operationName)

  if (status.raw.error) {
    throw new Error(
      `Vertex Veo operation error: ${status.raw.error.message ?? status.raw.error.status ?? status.raw.error.code}`,
    )
  }

  if (!status.done) {
    throw new Error('Vertex Veo operation is not yet done')
  }

  const inlineVideo = extractInlineVideo(status.raw)
  if (inlineVideo) {
    return Buffer.from(inlineVideo, 'base64')
  }

  if (status.gcsUri) {
    return downloadGcsObject(status.gcsUri)
  }

  if (status.videoUrl) {
    return downloadHttpUrl(status.videoUrl)
  }

  throw new Error('Vertex Veo: no video output found in operation response')
}

async function buildImageInput({
  imageUrl,
  imageBuffer,
  imageMimeType,
}: {
  imageUrl?: string
  imageBuffer?: Buffer
  imageMimeType?: string
}): Promise<VertexImageInput> {
  if (imageUrl?.startsWith('gs://')) {
    return {
      gcsUri: imageUrl,
      mimeType: normalizeVeoImageMimeType(imageMimeType ?? inferMimeType(imageUrl)),
    }
  }

  if (imageBuffer) {
    const asset = await toVeoCompatibleImage({
      buffer: imageBuffer,
      mimeType: imageMimeType,
    })

    return {
      bytesBase64Encoded: asset.buffer.toString('base64'),
      mimeType: asset.mimeType,
    }
  }

  if (!imageUrl) {
    throw new Error('Vertex Veo submit requires imageUrl or imageBuffer')
  }

  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error('imageUrl must be an http(s) URL or gs:// URI')
  }

  const imageRes = await fetch(imageUrl, { cache: 'no-store' })
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch Veo input image: ${imageRes.status}`)
  }

  const asset = await toVeoCompatibleImage({
    buffer: Buffer.from(await imageRes.arrayBuffer()),
    mimeType: imageMimeType ?? imageRes.headers.get('content-type')?.split(';')[0]?.trim(),
  })

  return {
    bytesBase64Encoded: asset.buffer.toString('base64'),
    mimeType: asset.mimeType,
  }
}

async function toVeoCompatibleImage({
  buffer,
  mimeType,
}: {
  buffer: Buffer
  mimeType?: string | null
}): Promise<VeoImageAsset> {
  const normalized = normalizeVeoImageMimeType(mimeType)
  if (normalized === 'image/jpeg' || normalized === 'image/png') {
    return { buffer, mimeType: normalized }
  }

  return {
    buffer: await sharp(buffer)
      .resize(1280, 720, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer(),
    mimeType: 'image/png',
  }
}

function extractVideoRefs(raw: VertexVeoOperation): { videoUrl: string | null; gcsUri: string | null } {
  const candidates = [
    ...(raw.response?.videos ?? []).flatMap((video) => [video.gcsUri, video.uri]),
    ...(raw.response?.generateVideoResponse?.generatedSamples ?? []).flatMap((sample) => [
      sample.video?.gcsUri,
      sample.video?.uri,
    ]),
    ...(raw.response?.predictions ?? []).flatMap((prediction) => [
      prediction.gcsUri,
      prediction.uri,
      prediction.video?.gcsUri,
      prediction.video?.uri,
    ]),
  ].filter((value): value is string => Boolean(value))

  return {
    gcsUri: candidates.find((value) => value.startsWith('gs://')) ?? null,
    videoUrl: candidates.find((value) => /^https?:\/\//i.test(value)) ?? null,
  }
}

function extractInlineVideo(raw: VertexVeoOperation): string | null {
  const videos = raw.response?.videos ?? []
  const videoInline = videos.find((video) => video.bytesBase64Encoded)?.bytesBase64Encoded
  if (videoInline) return videoInline

  const samples = raw.response?.generateVideoResponse?.generatedSamples ?? []
  const sampleInline = samples.find((sample) => sample.video?.bytesBase64Encoded)?.video
    ?.bytesBase64Encoded
  if (sampleInline) return sampleInline

  const predictions = raw.response?.predictions ?? []
  const predictionInline = predictions.find(
    (prediction) => prediction.bytesBase64Encoded ?? prediction.video?.bytesBase64Encoded,
  )

  return predictionInline?.bytesBase64Encoded ?? predictionInline?.video?.bytesBase64Encoded ?? null
}

async function downloadGcsObject(gcsUri: string): Promise<Buffer> {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsUri)
  if (!match) {
    throw new Error(`Invalid GCS URI: ${gcsUri}`)
  }

  const [, bucket, objectName] = match
  const accessToken = await getGoogleCloudAccessToken()
  const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucket,
  )}/o/${encodeURIComponent(objectName)}?alt=media`

  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GCS video download failed: ${res.status} ${text.slice(0, 240)}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

async function downloadHttpUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Veo video URL download failed: ${res.status}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

function getPublisherModelUrl(project: string) {
  const location = getGoogleCloudLocation()
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/${VERTEX_MODEL_RESOURCE}`
}

function getRequiredVeoEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

function normalizeVeoImageMimeType(mimeType?: string | null) {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase()
  if (normalized === 'image/jpeg' || normalized === 'image/png') {
    return normalized
  }
  return 'image/png-convert'
}

function inferMimeType(value: string) {
  if (/\.webp(\?|$)/i.test(value)) return 'image/webp'
  return /\.(jpe?g)(\?|$)/i.test(value) ? 'image/jpeg' : 'image/png'
}
