import { createSign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const INPUT_IMAGE = '/Users/danzelgaminde/Downloads/luxurious-suburban-home-stockcake.webp'
const OUTPUT_VIDEO = 'public/hero/house-solar-hero.mp4'
const OUTPUT_POSTER = 'public/hero/house-solar-hero-poster.webp'
const MODEL_RESOURCE = 'publishers/google/models/veo-3.1-generate-001'
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'
const PROMPT = `Use the uploaded reference photo as the exact home and exact scene. Create a slow cinematic fly-over slowly rotating to the left with golden hour lighting, starting from the same front exterior view and gently gliding upward and slightly across the house with smooth premium camera motion. Keep the architecture, rooflines, windows, driveway, trees, and overall property exactly consistent with the reference image. As the camera moves, matte black solar panels slowly and elegantly appear on the roof in believable positions, as if being precisely rendered into place. The panels should feel integrated, high-end, and realistic. Photorealistic luxury commercial style, calm and refined, warm evening sky, subtle atmosphere, no people, no cars, no text, no logos, no watermarks, no extra buildings, no house redesign, no added structures, no blue panels.`

for (const file of ['.env.local', '.env.vertex.production.local', '.env.vertex.preview.local']) {
  loadEnvFile(file)
}

async function main() {
  mkdirSync('public/hero', { recursive: true })
  writeFileSync(OUTPUT_POSTER, readFileSync(INPUT_IMAGE))

  const imageBuffer = readFileSync(INPUT_IMAGE)
  const pngBuffer = await sharp(imageBuffer)
    .resize(1920, 1080, {
      fit: 'cover',
      position: 'center',
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer()

  const operationName = await submitVertexVeo({
    prompt: PROMPT,
    imageBase64: pngBuffer.toString('base64'),
  })

  console.log(`Submitted Vertex Veo job: ${operationName}`)
  const videoBuffer = await waitForVideo(operationName)
  writeFileSync(OUTPUT_VIDEO, videoBuffer)
  console.log(`Saved ${OUTPUT_VIDEO} (${videoBuffer.length} bytes)`)
}

async function submitVertexVeo({ prompt, imageBase64 }) {
  const project = requiredEnv('GOOGLE_CLOUD_PROJECT_ID')
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  const storageUri = requiredEnv('GOOGLE_CLOUD_STORAGE_URI')
  const accessToken = await getGoogleCloudAccessToken()
  const url = publisherModelUrl(project, location)

  const res = await fetch(`${url}:predictLongRunning`, {
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
            bytesBase64Encoded: imageBase64,
            mimeType: 'image/png',
          },
        },
      ],
      parameters: {
        storageUri,
        sampleCount: 1,
        aspectRatio: '16:9',
        durationSeconds: 8,
        personGeneration: 'disallow',
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vertex Veo submit failed: ${res.status} ${text.slice(0, 800)}`)
  }

  const data = await res.json()
  if (!data.name) throw new Error(`Vertex Veo submit returned no operation name: ${JSON.stringify(data)}`)
  return data.name
}

async function waitForVideo(operationName) {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await sleep(10_000)
    const raw = await fetchVertexVeoStatus(operationName)

    if (raw.error) {
      throw new Error(`Vertex Veo operation failed: ${JSON.stringify(raw.error)}`)
    }

    console.log(`Veo status ${attempt}: done=${raw.done === true}`)
    if (raw.done !== true) continue

    const inlineVideo = extractInlineVideo(raw)
    if (inlineVideo) return Buffer.from(inlineVideo, 'base64')

    const refs = extractVideoRefs(raw)
    if (refs.gcsUri) return downloadGcsObject(refs.gcsUri)
    if (refs.videoUrl) return downloadHttpUrl(refs.videoUrl)

    throw new Error(`Veo finished without a video output: ${JSON.stringify(raw).slice(0, 1200)}`)
  }

  throw new Error('Timed out waiting for Vertex Veo video')
}

async function fetchVertexVeoStatus(operationName) {
  const project = requiredEnv('GOOGLE_CLOUD_PROJECT_ID')
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  const accessToken = await getGoogleCloudAccessToken()

  const res = await fetch(`${publisherModelUrl(project, location)}:fetchPredictOperation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ operationName }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vertex Veo status failed: ${res.status} ${text.slice(0, 800)}`)
  }

  return res.json()
}

async function getGoogleCloudAccessToken() {
  const clientEmail = requiredEnv('GOOGLE_CLOUD_CLIENT_EMAIL')
  const privateKey = requiredEnv('GOOGLE_CLOUD_PRIVATE_KEY').replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)
  const assertion = signJwt(
    { alg: 'RS256', typ: 'JWT' },
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
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google service account auth failed: ${res.status} ${text.slice(0, 800)}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new Error(`Google auth returned no access token: ${JSON.stringify(data)}`)
  return data.access_token
}

async function downloadGcsObject(gcsUri) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsUri)
  if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`)

  const [, bucket, objectName] = match
  const accessToken = await getGoogleCloudAccessToken()
  const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucket,
  )}/o/${encodeURIComponent(objectName)}?alt=media`

  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GCS video download failed: ${res.status} ${text.slice(0, 800)}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

async function downloadHttpUrl(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Veo video URL download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function extractVideoRefs(raw) {
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
  ].filter(Boolean)

  return {
    gcsUri: candidates.find((value) => value.startsWith('gs://')) ?? null,
    videoUrl: candidates.find((value) => /^https?:\/\//i.test(value)) ?? null,
  }
}

function extractInlineVideo(raw) {
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

function publisherModelUrl(project, location) {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/${MODEL_RESOURCE}`
}

function signJwt(header, payload, privateKey) {
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${base64Url(signer.sign(privateKey))}`
}

function base64UrlJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value)))
}

function base64Url(value) {
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function loadEnvFile(file) {
  if (!existsSync(file)) return

  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const splitAt = line.indexOf('=')
    if (splitAt === -1) continue

    const key = line.slice(0, splitAt).trim()
    let value = line.slice(splitAt + 1)
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (value && !process.env[key]) process.env[key] = value
  }
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
