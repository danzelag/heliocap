import { createSign } from 'crypto'

const VERTEX_LOCATION = 'us-central1'
const VERTEX_MODEL_RESOURCE = 'publishers/google/models/veo-3.1-generate-001'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const VEO_DURATION_SECONDS = 8

type CachedAccessToken = {
  token: string
  expiresAt: number
}

type VertexImageInput = {
  gcsUri?: string
  bytesBase64Encoded?: string
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

let cachedAccessToken: CachedAccessToken | null = null

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
  const project = getRequiredEnv('GOOGLE_CLOUD_PROJECT_ID')
  const storageUri = getRequiredEnv('GOOGLE_CLOUD_STORAGE_URI')
  const accessToken = await getAccessToken()
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
  const project = getRequiredEnv('GOOGLE_CLOUD_PROJECT_ID')
  const accessToken = await getAccessToken()

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
      mimeType: imageMimeType ?? inferMimeType(imageUrl),
    }
  }

  if (imageBuffer) {
    return {
      bytesBase64Encoded: imageBuffer.toString('base64'),
      mimeType: normalizeImageMimeType(imageMimeType),
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

  const mimeType = normalizeImageMimeType(
    imageMimeType ?? imageRes.headers.get('content-type')?.split(';')[0]?.trim(),
  )

  return {
    bytesBase64Encoded: Buffer.from(await imageRes.arrayBuffer()).toString('base64'),
    mimeType,
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
  const accessToken = await getAccessToken()
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

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 60_000) {
    return cachedAccessToken.token
  }

  const clientEmail = getRequiredEnv('GOOGLE_CLOUD_CLIENT_EMAIL')
  const privateKey = getRequiredEnv('GOOGLE_CLOUD_PRIVATE_KEY').replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)
  const assertion = signJwt(
    {
      alg: 'RS256',
      typ: 'JWT',
    },
    {
      iss: clientEmail,
      scope: CLOUD_PLATFORM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    privateKey,
  )

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google service account auth failed: ${res.status} ${text.slice(0, 240)}`)
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new Error('Google service account auth failed: no access token returned')
  }

  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }

  return cachedAccessToken.token
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKey: string) {
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${base64Url(signer.sign(privateKey))}`
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64Url(Buffer.from(JSON.stringify(value)))
}

function base64Url(value: Buffer) {
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function getPublisherModelUrl(project: string) {
  return `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${VERTEX_LOCATION}/${VERTEX_MODEL_RESOURCE}`
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

function normalizeImageMimeType(mimeType?: string | null) {
  if (mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp') {
    return mimeType
  }
  return 'image/png'
}

function inferMimeType(value: string) {
  if (/\.webp(\?|$)/i.test(value)) return 'image/webp'
  return /\.(jpe?g)(\?|$)/i.test(value) ? 'image/jpeg' : 'image/png'
}
