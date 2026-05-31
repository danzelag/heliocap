import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createSign } from 'node:crypto'
import sharp from 'sharp'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_DEPLOYMENT_URL = process.env.HERO_VIDEO_DEPLOYMENT_URL || 'https://heliocap.vercel.app'
const DEFAULT_HOUSE_IMAGE = '/Users/danzelgaminde/Downloads/luxurious-suburban-home-stockcake.webp'
const DEFAULT_EV_CHARGER_IMAGE = '/Users/danzelgaminde/Desktop/maxperr.webp'
const OUTPUT_VIDEO = 'public/hero/home-energy-scrolly.mp4'
const OUTPUT_POSTER = 'public/hero/home-energy-scrolly-poster.webp'
const MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-preview'
const VERTEX_MODEL_RESOURCE = process.env.VERTEX_VEO_MODEL || 'publishers/google/models/veo-3.1-generate-001'
const RESOLUTION = process.env.VEO_RESOLUTION || '1080p'
const DURATION_SECONDS = Number(process.env.VEO_DURATION_SECONDS || 8)
const POSTER_ONLY = process.env.SCROLLY_POSTER_ONLY === '1'
const DEFAULT_SERVICE_ACCOUNT_PATH = '/Users/danzelgaminde/Downloads/heliocap-6761c11f8917.json'

const PROMPT = `Cinematic drone-style shot of a modern luxury Canadian suburban home at soft dusk. The uploaded reference is a visual reference board: use the house as the primary architectural source of truth, and use the blue wall-mounted EV charger only as the charger shape/material reference for Scene 3. Do not show a split-screen, reference board, poster, collage, picture-in-picture, labels, or product cutout in the final video. Keep the home and neighborhood realistic, premium, calm, and consistent. The camera moves in one continuous elegant motion designed as a scrolling website background.

Scene 1: approach the front of the home and rise toward the roof. High-efficiency matte black / dark graphite solar panels elegantly render and assemble onto the main home's roof in a realistic premium product-visualization style. The panels must be dark charcoal black, not blue, not silver, not reflective bright blue. Subtle soft sunlight reflections move across the completed black solar array. Hold briefly.

Scene 2: glide toward the home and transition inside through a window or wall in a smooth architectural cutaway style. Show a clean interior wall vent and subtle animated airflow. Visualize warm air and cool air as soft translucent pale blue and warm white flowing ribbons, realistic and restrained, moving through the vent and across the room. Show a modern cold-climate heat pump system working efficiently. Hold briefly.

Scene 3: continue smoothly into the garage. Show a premium blue wall-mounted EV charger with a minimal rounded vertical body, black cable, black charging handle, and green vertical status light, mounted neatly on the garage wall beside a modern electric car. The charger face must be blank with no readable text, no letters, no icons, no EV logo, no labels, no brand marks. The charging cable moves smoothly and plugs into the car charging port, with a subtle glow indicating charging has started. Hold briefly.

Visual style: luxury architectural cinematography, soft pale blue and white tones, clean premium renewable energy brand, realistic materials, subtle motion, no people, no hands, no text anywhere in the image, no letters, no numbers, no logos, no captions, no watermarks, no UI, no cartoon style, calm and expensive.`

for (const file of ['.env.local', '.env.vercel.production.local', '.env.vertex.production.local', '.env.vertex.preview.local']) {
  loadEnvFile(file)
}

async function main() {
  const houseImage = resolve(process.argv[2] || DEFAULT_HOUSE_IMAGE)
  const chargerImage = resolve(process.argv[3] || DEFAULT_EV_CHARGER_IMAGE)
  if (!existsSync(houseImage)) throw new Error(`House image not found: ${houseImage}`)
  if (!existsSync(chargerImage)) throw new Error(`EV charger image not found: ${chargerImage}`)

  mkdirSync(dirname(OUTPUT_VIDEO), { recursive: true })

  const houseBuffer = readFileSync(houseImage)
  const chargerBuffer = readFileSync(chargerImage)
  const imageBase64 = await buildReferencePng({ houseBuffer, chargerBuffer })
  const poster = await sharp(houseBuffer)
    .rotate()
    .resize(1600, 900, { fit: 'cover', position: 'center', kernel: sharp.kernel.lanczos3 })
    .webp({ quality: 86 })
    .toBuffer()
  writeFileSync(OUTPUT_POSTER, poster)

  if (POSTER_ONLY) {
    console.log(`Saved ${OUTPUT_POSTER}`)
    console.log('Skipped Veo generation because SCROLLY_POSTER_ONLY=1')
    return
  }

  const videoBuffer = hasVertexServiceAccount()
    ? await renderViaVertexServiceAccount({
        imageBase64,
        durationSeconds: DURATION_SECONDS,
      })
    : hasVertexBridge()
    ? await renderViaVertexBridge({
        imageBase64,
        durationSeconds: DURATION_SECONDS,
      })
    : await renderViaGeminiApi({
        imageBase64,
      })

  writeFileSync(OUTPUT_VIDEO, videoBuffer)
  console.log(`Saved ${OUTPUT_VIDEO} (${videoBuffer.length} bytes)`)
}

async function buildReferencePng({ houseBuffer, chargerBuffer }) {
  const house = await sharp(houseBuffer)
    .rotate()
    .resize(1920, 1080, { fit: 'cover', position: 'center', kernel: sharp.kernel.lanczos3 })
    .modulate({ saturation: 0.96, brightness: 1.02 })
    .png()
    .toBuffer()

  const charger = await sharp(chargerBuffer)
    .rotate()
    .trim({ background: '#000000', threshold: 12 })
    .resize(300, 560, {
      fit: 'inside',
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer()

  const chargerReference = await sharp({
    create: {
      width: 380,
      height: 660,
      channels: 4,
      background: { r: 244, g: 248, b: 248, alpha: 0.92 },
    },
  })
    .composite([{ input: charger, gravity: 'center' }])
    .png()
    .toBuffer()

  const pngBuffer = await sharp(house)
    .composite([
      {
        input: chargerReference,
        left: 1496,
        top: 210,
      },
    ])
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer()

  return pngBuffer.toString('base64')
}

async function renderViaVertexBridge({ imageBase64, durationSeconds }) {
  const sharedSecret = requiredEnv('HERO_VIDEO_SHARED_SECRET')
  const deploymentUrl = process.env.HERO_VIDEO_DEPLOYMENT_URL || DEFAULT_DEPLOYMENT_URL

  const submit = await postVertexBridge(deploymentUrl, sharedSecret, {
    action: 'submit',
    prompt: PROMPT,
    imageBase64,
    durationSeconds,
  })

  if (!submit.operationName || typeof submit.operationName !== 'string') {
    throw new Error(`Vertex bridge submit returned no operation name: ${JSON.stringify(submit)}`)
  }

  console.log(`Submitted Vertex Veo operation: ${submit.operationName}`)

  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await sleep(10_000)
    const status = await postVertexBridge(deploymentUrl, sharedSecret, {
      action: 'status',
      operationName: submit.operationName,
    })

    console.log(`Vertex Veo status ${attempt}: done=${status.done === true} failed=${status.failed === true}`)

    if (status.failed) {
      throw new Error(`Vertex bridge generation failed: ${JSON.stringify(status.error ?? status)}`)
    }

    if (status.done !== true) continue

    return downloadFromVertexBridge(deploymentUrl, sharedSecret, {
      action: 'download',
      operationName: submit.operationName,
    })
  }

  throw new Error('Timed out waiting for Vertex Veo video')
}

async function renderViaGeminiApi({ imageBase64 }) {
  const operationName = await submitVeo(imageBase64)
  console.log(`Submitted Gemini Veo operation: ${operationName}`)
  return waitForVideo(operationName)
}

async function renderViaVertexServiceAccount({ imageBase64, durationSeconds }) {
  const serviceAccount = loadServiceAccount()
  const accessToken = await getServiceAccountAccessToken(serviceAccount)
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID || serviceAccount.project_id
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  const storageUri = process.env.GOOGLE_CLOUD_STORAGE_URI?.trim()
  const operationName = await submitVertexVeo({
    accessToken,
    project,
    location,
    storageUri,
    imageBase64,
    durationSeconds,
  })

  console.log(`Submitted Vertex Veo operation: ${operationName}`)
  return waitForVertexVideo({
    accessToken,
    project,
    location,
    operationName,
    serviceAccount,
  })
}

async function submitVertexVeo({ accessToken, project, location, storageUri, imageBase64, durationSeconds }) {
  const parameters = {
    sampleCount: 1,
    aspectRatio: '16:9',
    durationSeconds,
    personGeneration: 'disallow',
    ...(storageUri ? { storageUri } : {}),
  }

  const res = await fetch(getVertexModelUrl(project, location) + ':predictLongRunning', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: PROMPT,
          image: {
            bytesBase64Encoded: imageBase64,
            mimeType: 'image/png',
          },
        },
      ],
      parameters,
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Vertex Veo submit failed: ${res.status} ${text.slice(0, 1000)}`)
  }

  const data = JSON.parse(text)
  if (!data.name) throw new Error(`Vertex Veo submit returned no operation name: ${text.slice(0, 1000)}`)
  return data.name
}

async function waitForVertexVideo({ accessToken, project, location, operationName, serviceAccount }) {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await sleep(10_000)
    const status = await fetchVertexStatus({ accessToken, project, location, operationName })

    console.log(`Vertex Veo status ${attempt}: done=${status.done === true} failed=${Boolean(status.error)}`)

    if (status.error) {
      throw new Error(`Vertex Veo operation failed: ${JSON.stringify(status.error)}`)
    }

    if (status.done !== true) continue

    const inlineVideo = extractVertexInlineVideo(status)
    if (inlineVideo) return Buffer.from(inlineVideo, 'base64')

    const uri = extractVertexVideoUri(status)
    if (uri?.startsWith('gs://')) {
      return downloadGcsObject(uri, serviceAccount)
    }
    if (uri) {
      return downloadHttpUrl(uri, accessToken)
    }

    throw new Error(`Vertex Veo finished without a video URI: ${JSON.stringify(status).slice(0, 1200)}`)
  }

  throw new Error('Timed out waiting for Vertex Veo video')
}

async function fetchVertexStatus({ accessToken, project, location, operationName }) {
  const res = await fetch(getVertexModelUrl(project, location) + ':fetchPredictOperation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ operationName }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`Vertex Veo status failed: ${res.status} ${text.slice(0, 1000)}`)
  return JSON.parse(text)
}

async function submitVeo(imageBase64) {
  const apiKey = requiredEnv('GEMINI_API_KEY')
  const res = await fetch(`${BASE_URL}/models/${MODEL}:predictLongRunning`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: PROMPT,
          image: {
            inlineData: {
              mimeType: 'image/png',
              data: imageBase64,
            },
          },
        },
      ],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: DURATION_SECONDS,
        numberOfVideos: 1,
        resolution: RESOLUTION,
        personGeneration: 'disallow',
      },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini Veo submit failed: ${res.status} ${text.slice(0, 1000)}`)
  }

  const data = await res.json()
  if (!data.name) throw new Error(`Gemini Veo submit returned no operation name: ${JSON.stringify(data)}`)
  return data.name
}

async function waitForVideo(operationName) {
  const apiKey = requiredEnv('GEMINI_API_KEY')

  for (let attempt = 1; attempt <= 60; attempt += 1) {
    await sleep(10_000)
    const res = await fetch(`${BASE_URL}/${operationName}`, {
      headers: {
        'x-goog-api-key': apiKey,
      },
    })

    const text = await res.text()
    if (!res.ok) throw new Error(`Gemini Veo status failed: ${res.status} ${text.slice(0, 1000)}`)

    const status = JSON.parse(text)
    if (status.error) throw new Error(`Gemini Veo operation failed: ${JSON.stringify(status.error)}`)

    console.log(`Veo status ${attempt}: done=${status.done === true}`)
    if (status.done !== true) continue

    const inlineVideo = extractInlineVideo(status)
    if (inlineVideo) return Buffer.from(inlineVideo, 'base64')

    const uri = extractVideoUri(status)
    if (!uri) throw new Error(`Gemini Veo finished without a video URI: ${JSON.stringify(status).slice(0, 1200)}`)
    return downloadVideo(uri, apiKey)
  }

  throw new Error('Timed out waiting for Gemini Veo video')
}

async function downloadVideo(uri, apiKey) {
  const res = await fetch(uri, {
    headers: {
      'x-goog-api-key': apiKey,
    },
    redirect: 'follow',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini Veo download failed: ${res.status} ${text.slice(0, 1000)}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

function extractInlineVideo(raw) {
  const sample = raw.response?.generateVideoResponse?.generatedSamples?.find((item) => item.video?.bytesBase64Encoded)
  if (sample?.video?.bytesBase64Encoded) return sample.video.bytesBase64Encoded

  const generated = raw.response?.generatedVideos?.find((item) => item.video?.videoBytes)
  return generated?.video?.videoBytes ?? null
}

function extractVideoUri(raw) {
  return (
    raw.response?.generateVideoResponse?.generatedSamples?.find((item) => item.video?.uri)?.video?.uri ??
    raw.response?.generatedVideos?.find((item) => item.video?.uri)?.video?.uri ??
    null
  )
}

function extractVertexInlineVideo(raw) {
  const videoInline = raw.response?.videos?.find((video) => video.bytesBase64Encoded)?.bytesBase64Encoded
  if (videoInline) return videoInline

  const sampleInline = raw.response?.generateVideoResponse?.generatedSamples?.find(
    (sample) => sample.video?.bytesBase64Encoded,
  )?.video?.bytesBase64Encoded
  if (sampleInline) return sampleInline

  const predictionInline = raw.response?.predictions?.find(
    (prediction) => prediction.bytesBase64Encoded || prediction.video?.bytesBase64Encoded,
  )

  return predictionInline?.bytesBase64Encoded ?? predictionInline?.video?.bytesBase64Encoded ?? null
}

function extractVertexVideoUri(raw) {
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

  return candidates[0] ?? null
}

async function downloadGcsObject(gcsUri, serviceAccount) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gcsUri)
  if (!match) throw new Error(`Invalid GCS URI: ${gcsUri}`)

  const [, bucket, objectName] = match
  const accessToken = await getServiceAccountAccessToken(serviceAccount)
  const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(
    objectName,
  )}?alt=media`
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GCS video download failed: ${res.status} ${text.slice(0, 1000)}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

async function downloadHttpUrl(url, accessToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vertex video URL download failed: ${res.status} ${text.slice(0, 1000)}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

function getVertexModelUrl(project, location) {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/${VERTEX_MODEL_RESOURCE}`
}

function loadServiceAccount() {
  const rawJson = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim()
  if (rawJson) return JSON.parse(rawJson)

  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS || DEFAULT_SERVICE_ACCOUNT_PATH
  if (!existsSync(path)) throw new Error(`Google service account JSON not found: ${path}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

let cachedGoogleAccessToken = null

async function getServiceAccountAccessToken(serviceAccount) {
  if (cachedGoogleAccessToken && Date.now() < cachedGoogleAccessToken.expiresAt - 60_000) {
    return cachedGoogleAccessToken.token
  }

  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64UrlJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlJson({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const assertion = `${unsigned}.${base64Url(signer.sign(serviceAccount.private_key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`Google service account auth failed: ${res.status} ${text.slice(0, 1000)}`)

  const data = JSON.parse(text)
  if (!data.access_token) throw new Error(`Google service account auth returned no access token: ${text.slice(0, 1000)}`)

  cachedGoogleAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  }

  return cachedGoogleAccessToken.token
}

function base64UrlJson(value) {
  return base64Url(Buffer.from(JSON.stringify(value)))
}

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function postVertexBridge(deploymentUrl, sharedSecret, body) {
  const response = await fetch(new URL('/api/hero-video', deploymentUrl), {
    method: 'POST',
    headers: {
      'x-hero-auth': sharedSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Vertex bridge failed: ${response.status} ${text.slice(0, 1000)}`)
  }

  return JSON.parse(text)
}

async function downloadFromVertexBridge(deploymentUrl, sharedSecret, body) {
  const response = await fetch(new URL('/api/hero-video', deploymentUrl), {
    method: 'POST',
    headers: {
      'x-hero-auth': sharedSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Vertex bridge download failed: ${response.status} ${text.slice(0, 1000)}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

function hasVertexBridge() {
  return Boolean(process.env.HERO_VIDEO_SHARED_SECRET?.trim())
}

function hasVertexServiceAccount() {
  return Boolean(
    process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
      existsSync(DEFAULT_SERVICE_ACCOUNT_PATH),
  )
}

function loadEnvFile(file) {
  if (!existsSync(file)) return

  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const splitAt = line.indexOf('=')
    if (splitAt === -1) continue

    const key = line.slice(0, splitAt).trim()
    const value = line.slice(splitAt + 1).trim()
    if (!key || process.env[key] !== undefined) continue

    process.env[key] = unquoteEnv(value)
  }
}

function unquoteEnv(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }

  return value
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
