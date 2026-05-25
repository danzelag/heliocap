import {
  getGoogleCloudAccessToken,
  getGoogleCloudLocation,
  getGoogleCloudProjectId,
} from '@/lib/google-cloud-auth'
import sharp from 'sharp'

const VERTEX_MODEL_RESOURCE = 'publishers/google/models/veo-3.1-generate-001'

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
    }>
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string
          gcsUri?: string
          bytesBase64Encoded?: string
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
      }
    }>
  }
}

export async function submitVertexVeoRender({
  prompt,
  imageBuffer,
  durationSeconds = 8,
}: {
  prompt: string
  imageBuffer: Buffer
  durationSeconds?: number
}) {
  const project = getGoogleCloudProjectId()
  const storageUri = getRequiredVeoEnv('GOOGLE_CLOUD_STORAGE_URI')
  const accessToken = await getGoogleCloudAccessToken()
  const pngBuffer = await sharp(imageBuffer)
    .resize(1920, 1080, {
      fit: 'cover',
      position: 'center',
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer()

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
          image: {
            bytesBase64Encoded: pngBuffer.toString('base64'),
            mimeType: 'image/png',
          },
        },
      ],
      parameters: {
        storageUri,
        sampleCount: 1,
        aspectRatio: '16:9',
        durationSeconds,
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
  if (!data.name) throw new Error('Vertex Veo submit: no operation name in response')

  return data.name
}

export async function fetchVertexVeoStatus(operationName: string) {
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

  return (await res.json()) as VertexVeoOperation
}

export async function downloadVertexVeoVideo(operationName: string) {
  const status = await fetchVertexVeoStatus(operationName)

  if (status.error) {
    throw new Error(`Vertex Veo operation error: ${status.error.message ?? status.error.status ?? status.error.code}`)
  }

  if (!status.done) throw new Error('Vertex Veo operation is not yet done')

  const inlineVideo = extractInlineVideo(status)
  if (inlineVideo) return Buffer.from(inlineVideo, 'base64')

  const refs = extractVideoRefs(status)
  if (refs.gcsUri) return downloadGcsObject(refs.gcsUri)
  if (refs.videoUrl) return downloadHttpUrl(refs.videoUrl)

  throw new Error('Vertex Veo: no video output found in operation response')
}

function extractVideoRefs(raw: VertexVeoOperation) {
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

function extractInlineVideo(raw: VertexVeoOperation) {
  const videos = raw.response?.videos ?? []
  const videoInline = videos.find((video) => video.bytesBase64Encoded)?.bytesBase64Encoded
  if (videoInline) return videoInline

  const samples = raw.response?.generateVideoResponse?.generatedSamples ?? []
  const sampleInline = samples.find((sample) => sample.video?.bytesBase64Encoded)?.video?.bytesBase64Encoded
  if (sampleInline) return sampleInline

  const predictions = raw.response?.predictions ?? []
  const predictionInline = predictions.find(
    (prediction) => prediction.bytesBase64Encoded ?? prediction.video?.bytesBase64Encoded,
  )

  return predictionInline?.bytesBase64Encoded ?? predictionInline?.video?.bytesBase64Encoded ?? null
}

async function downloadGcsObject(gcsUri: string) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsUri)
  if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`)

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

async function downloadHttpUrl(url: string) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Veo video URL download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function getPublisherModelUrl(project: string) {
  const location = getGoogleCloudLocation()
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/${VERTEX_MODEL_RESOURCE}`
}

function getRequiredVeoEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}
