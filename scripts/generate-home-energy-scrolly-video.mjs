import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createSign } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import ffmpeg from 'ffmpeg-static'
import sharp from 'sharp'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_DEPLOYMENT_URL = process.env.HERO_VIDEO_DEPLOYMENT_URL || 'https://heliocap.vercel.app'
const DEFAULT_HOUSE_IMAGE = '/Users/danzelgaminde/Downloads/luxurious-suburban-home-stockcake.webp'
const OUTPUT_VIDEO = 'public/hero/home-energy-scrolly.mp4'
const OUTPUT_POSTER = 'public/hero/home-energy-scrolly-poster.webp'
const MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-preview'
const VERTEX_MODEL_RESOURCE = process.env.VERTEX_VEO_MODEL || 'publishers/google/models/veo-3.1-generate-001'
const RESOLUTION = process.env.VEO_RESOLUTION || '1080p'
const DURATION_SECONDS = Number(process.env.VEO_DURATION_SECONDS || 8)
const POSTER_ONLY = process.env.SCROLLY_POSTER_ONLY === '1'
const GENERATE_CLIPS = process.env.SCROLLY_CLIPS === '1'
const GENERATE_CLIP_KEY = process.env.SCROLLY_CLIP?.trim()
const DEFAULT_SERVICE_ACCOUNT_PATH = '/Users/danzelgaminde/Downloads/heliocap-6761c11f8917.json'
const ENERGY_CLIPS = [
  {
    key: 'solar',
    outputVideo: 'public/hero/energy-solar.mp4',
    outputPoster: 'public/hero/energy-solar-poster.webp',
    imagePath: '/Users/danzelgaminde/Downloads/roof image.jpg',
    prompt:
      'Use the uploaded roof image as the exact first frame and fixed source of truth. Create a premium, realistic 8-second roof-level solar reveal like a high-end product visualization: the roof begins empty, then matte black solar panels magically but subtly materialize row by row from the left side of the frame toward the right. The reveal should be slow and satisfying: faint alignment guides or soft edge highlights appear, panels fade/slide into place flush with the shingles, then settle into realistic physical modules. By the final two seconds, every believable usable roof plane is full of neatly aligned dark graphite solar panels: the broad front roof slope, the large left roof slope, and the right/back visible roof slope where panels can realistically fit. Leave gutters, valleys, ridge lines, windows, dormers, walls, trees, driveway, sky, and garden areas untouched. Keep the camera perspective, house geometry, roof texture, and lighting stable, with only a very subtle stabilized drone drift. No hard cuts, no scene changes, no text, no logos, no installers, no people, no floating panels. End on a clean hold frame where the roof looks packed with premium black panels, calm expensive architectural website footage.',
  },
  {
    key: 'heatpump',
    outputVideo: 'public/hero/energy-heat-pump.mp4',
    outputPoster: 'public/hero/energy-heat-pump-poster.webp',
    imagePath: '/Users/danzelgaminde/Downloads/chatgpt heat pump.png',
    prompt:
      'Use the uploaded heat pump image as the subject and improve it into a more realistic premium exterior product shot. Create an 8-second photorealistic video of a modern cold-climate heat pump operating beside a clean home wall. Make the unit look like a real photographed appliance with believable metal, plastic, grille depth, shadows, and scale. Subtle fan motion inside the unit, soft heat shimmer, and gentle sun beams move across the casing and surrounding wall as the system operates. Keep the camera slow and stable with a refined push-in or slight lateral drift. No text, no logos, no labels, no UI, no people, no hands, no cartoon airflow ribbons, no sci-fi effects, no oversaturated glow. Calm high-end renewable-home cinematography.',
  },
  {
    key: 'ev',
    outputVideo: 'public/hero/energy-ev-charger.mp4',
    outputPoster: 'public/hero/energy-ev-charger-poster.webp',
    referenceImages: [
      '/Users/danzelgaminde/Downloads/maxperr.webp',
      '/Users/danzelgaminde/Downloads/large-618-electrifyhomeintroduceshomestationaconnectedhomechargingsolutiontosimplifyelectricvehicleownership.jpg',
    ],
    prompt:
      'Use the first uploaded reference image as the exact EV charger product model. The charger must match that model: vertical rounded capsule body, soft metallic blue front face, dark grey side body, black circular display near the top, single green vertical status light on the front, black cable, black charging handle, cable hanging from the bottom. Do not use the charger design from the second image. Use the second uploaded reference image only as a loose reference for a clean upscale residential garage and a parked electric car near a wall charger. Create an 8-second photorealistic close-up video with the car already parked and completely still. No driving, no reversing, no drifting, no tire movement, no steering, no weird maneuver. Start on a tight premium shot of the car charging-port area with the wall-mounted blue capsule charger visible nearby. The car plug cover opens smoothly. Then the black charging plug from the blue capsule charger moves into the open charging port and connects cleanly. End with the plug fully seated and the charger status light glowing green. Remove the person completely. No people, no hands, no arms, no text, no logos, no brand marks, no UI, no duplicate chargers, no white wall-box charger, no flat rectangular charger, no oversized charger, no warped cable. Stable cinematic camera, subtle dolly only, realistic lighting, premium home-energy website footage.',
  },
]

const PROMPT = `Use the uploaded reference photo as the exact exterior home style and starting scene. Create one continuous cinematic drone-style shot of a modern luxury Canadian suburban home at soft dusk, grey siding, light stone facade, black trim, large driveway, warm architectural lighting, premium clean energy brand aesthetic. The camera feels like a smooth drone flying around the home in one elegant unbroken take.

Opening movement: The drone approaches the front of the home and rises toward the roof in a slow left-to-right orbit. High-efficiency matte black solar panels gradually appear across the roof from one side to the other, as if being precisely rendered into place. The panels must be black/dark graphite only, not blue, not silver, and not reflective bright blue. Place panels only on believable main-home roof planes, never on trees, lawns, walls, driveways, neighboring homes, floating surfaces, or the sky. Subtle sunlight reflections move across the completed black solar array. Hold briefly on the roof for a website text overlay moment.

Middle movement: Without a hard cut, the camera glides toward the home and transitions inside through a window or wall in a smooth architectural cutaway style. Show a clean interior wall vent and subtle animated airflow. Visualize warm air and cool air as soft translucent flowing ribbons, realistic and restrained, not cartoonish, moving through the vent and across the room. Show a modern heat pump system working efficiently in a cold-climate Canadian home. Hold briefly for a website text overlay moment.

Final movement: Without a hard cut, the camera continues smoothly into the garage. Show a premium blue wall-mounted EV charger with a black cable and handle, green vertical status light, mounted neatly on the garage wall. The charger face must be blank with no readable text, no letters, no icons, no EV logo, no labels, and no brand marks. A modern electric car is parked nearby. The charging cable/plug moves smoothly and plugs into the car charging port, with a subtle glow indicating charging has started. Hold briefly for a website text overlay moment.

Visual style: luxury architectural cinematography, soft pale blue and white tones, clean premium renewable energy brand, realistic materials, subtle motion, no clutter, no people, no hands, no text inside the video, no logos, no watermarks, no UI, no cartoon style. The video must feel seamless, calm, expensive, and designed for a high-end website scrollytelling section.

Negative guidance: no text, no captions, no logos, no brand marks, no people, no hands, no distorted house geometry, no unrealistic cartoon airflow, no harsh neon colors, no oversaturated colors, no shaky camera, no abrupt cuts, no scene-jump feeling, no messy garage, no cheap stock footage look, no futuristic sci-fi interface, no change in home style between moments.`

for (const file of ['.env.local', '.env.vercel.production.local', '.env.vertex.production.local', '.env.vertex.preview.local']) {
  loadEnvFile(file)
}

async function main() {
  if (GENERATE_CLIPS) {
    await renderEnergyClips()
    return
  }

  const houseImage = resolve(process.argv[2] || DEFAULT_HOUSE_IMAGE)
  if (!existsSync(houseImage)) throw new Error(`House image not found: ${houseImage}`)

  mkdirSync(dirname(OUTPUT_VIDEO), { recursive: true })

  const houseBuffer = readFileSync(houseImage)
  const imageBase64 = await buildReferencePng({ houseBuffer })
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
        prompt: PROMPT,
        imageBase64,
        durationSeconds: DURATION_SECONDS,
      })
    : hasVertexBridge()
    ? await renderViaVertexBridge({
        prompt: PROMPT,
        imageBase64,
        durationSeconds: DURATION_SECONDS,
      })
    : await renderViaGeminiApi({
        prompt: PROMPT,
        imageBase64,
      })

  writeFileSync(OUTPUT_VIDEO, videoBuffer)
  cleanKnownEvChargerMarks(OUTPUT_VIDEO)
  console.log(`Saved ${OUTPUT_VIDEO} (${videoBuffer.length} bytes)`)
}

async function renderEnergyClips() {
  mkdirSync('public/hero', { recursive: true })

  const clips = GENERATE_CLIP_KEY ? ENERGY_CLIPS.filter((clip) => clip.key === GENERATE_CLIP_KEY) : ENERGY_CLIPS
  if (GENERATE_CLIP_KEY && clips.length === 0) throw new Error(`Unknown SCROLLY_CLIP: ${GENERATE_CLIP_KEY}`)

  for (const clip of clips) {
    console.log(`Rendering ${clip.key} clip...`)
    const primaryImagePath = resolve(clip.imagePath || clip.referenceImages?.[0])
    if (!existsSync(primaryImagePath)) throw new Error(`Reference image not found: ${primaryImagePath}`)

    const primaryBuffer = readFileSync(primaryImagePath)
    const poster = await sharp(primaryBuffer)
      .rotate()
      .resize(1600, 900, { fit: 'cover', position: 'center', kernel: sharp.kernel.lanczos3 })
      .webp({ quality: 86 })
      .toBuffer()
    writeFileSync(clip.outputPoster, poster)

    if (POSTER_ONLY) {
      console.log(`Saved ${clip.outputPoster}`)
      continue
    }

    const imageBase64 = clip.imagePath ? await buildReferencePng({ houseBuffer: primaryBuffer }) : null
    const referenceImages = clip.referenceImages
      ? await Promise.all(
          clip.referenceImages.map(async (imagePath) => {
            const buffer = readFileSync(resolve(imagePath))
            return {
              bytesBase64Encoded: await buildReferencePng({ houseBuffer: buffer }),
              mimeType: 'image/png',
            }
          }),
        )
      : null

    const videoBuffer = hasVertexServiceAccount()
      ? await renderViaVertexServiceAccount({
          prompt: clip.prompt,
          imageBase64,
          referenceImages,
          durationSeconds: DURATION_SECONDS,
        })
      : hasVertexBridge()
      ? await renderViaVertexBridge({
          prompt: clip.prompt,
          imageBase64,
          durationSeconds: DURATION_SECONDS,
        })
      : await renderViaGeminiApi({
          prompt: clip.prompt,
          imageBase64,
        })

    writeFileSync(clip.outputVideo, videoBuffer)
    stripAudio(clip.outputVideo)
    optimizeClipForScroll(clip.outputVideo)
    console.log(`Saved ${clip.outputVideo} (${videoBuffer.length} bytes)`)
  }
}

async function buildReferencePng({ houseBuffer }) {
  const house = await sharp(houseBuffer)
    .rotate()
    .resize(1920, 1080, { fit: 'cover', position: 'center', kernel: sharp.kernel.lanczos3 })
    .modulate({ saturation: 0.96, brightness: 1.02 })
    .png()
    .toBuffer()

  return house.toString('base64')
}

function cleanKnownEvChargerMarks(videoPath) {
  if (!ffmpeg || process.env.SCROLLY_SKIP_EV_MARK_CLEANUP === '1') return

  const outputPath = `${videoPath}.tmp.mp4`
  const { width, height } = getVideoSize(videoPath)
  const sx = width / 1280
  const sy = height / 720
  const delogo = ({ x, y, w, h, enable }) =>
    `delogo=x=${Math.round(x * sx)}:y=${Math.round(y * sy)}:w=${Math.round(w * sx)}:h=${Math.round(h * sy)}:show=0:enable='${enable}'`
  const filters = [
    delogo({ x: 485, y: 98, w: 60, h: 55, enable: 'between(t,4.55,5.2)' }),
    delogo({ x: 420, y: 105, w: 55, h: 60, enable: 'between(t,5.1,6.0)' }),
    delogo({ x: 340, y: 105, w: 70, h: 60, enable: 'gte(t,5.9)' }),
    delogo({ x: 485, y: 345, w: 70, h: 65, enable: 'between(t,4.55,5.2)' }),
    delogo({ x: 415, y: 330, w: 70, h: 70, enable: 'between(t,5.1,6.0)' }),
    delogo({ x: 325, y: 330, w: 90, h: 80, enable: 'gte(t,5.9)' }),
    delogo({ x: 410, y: 258, w: 84, h: 78, enable: 'gte(t,5.7)' }),
    delogo({ x: 414, y: 408, w: 68, h: 64, enable: 'gte(t,5.7)' }),
  ].join(',')

  try {
    execFileSync(
      ffmpeg,
      [
        '-y',
        '-i',
        videoPath,
        '-vf',
        filters,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'medium',
        '-crf',
        '18',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { stdio: 'ignore' },
    )
    renameSync(outputPath, videoPath)
  } catch (error) {
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath)
    } catch {
      // Ignore cleanup errors; the original video is still usable.
    }

    console.warn(`Skipped EV mark cleanup: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function stripAudio(videoPath) {
  if (!ffmpeg) return

  const outputPath = `${videoPath}.silent.mp4`
  try {
    execFileSync(
      ffmpeg,
      ['-y', '-i', videoPath, '-an', '-c:v', 'copy', '-movflags', '+faststart', outputPath],
      { stdio: 'ignore' },
    )
    renameSync(outputPath, videoPath)
  } catch (error) {
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath)
    } catch {
      // Keep the generated video if cleanup fails.
    }

    console.warn(`Skipped audio cleanup: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function optimizeClipForScroll(videoPath) {
  if (!ffmpeg) return

  const outputPath = `${videoPath}.scroll.mp4`
  try {
    execFileSync(
      ffmpeg,
      [
        '-y',
        '-i',
        videoPath,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '21',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '12',
        '-keyint_min',
        '12',
        '-sc_threshold',
        '0',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { stdio: 'ignore' },
    )
    renameSync(outputPath, videoPath)
  } catch (error) {
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath)
    } catch {
      // Keep the generated video if optimization fails.
    }

    console.warn(`Skipped scroll optimization: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function getVideoSize(videoPath) {
  try {
    execFileSync(ffmpeg, ['-hide_banner', '-i', videoPath], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : ''
    const match = stderr.match(/Video:.*?(\d{3,5})x(\d{3,5})/)
    if (match) return { width: Number(match[1]), height: Number(match[2]) }
  }

  return { width: 1280, height: 720 }
}

async function renderViaVertexBridge({ prompt, imageBase64, durationSeconds }) {
  const sharedSecret = requiredEnv('HERO_VIDEO_SHARED_SECRET')
  const deploymentUrl = process.env.HERO_VIDEO_DEPLOYMENT_URL || DEFAULT_DEPLOYMENT_URL

  const submit = await postVertexBridge(deploymentUrl, sharedSecret, {
    action: 'submit',
    prompt,
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

async function renderViaGeminiApi({ prompt, imageBase64 }) {
  const operationName = await submitVeo({ prompt, imageBase64 })
  console.log(`Submitted Gemini Veo operation: ${operationName}`)
  return waitForVideo(operationName)
}

async function renderViaVertexServiceAccount({ prompt, imageBase64, referenceImages, durationSeconds }) {
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
    prompt,
    imageBase64,
    referenceImages,
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

async function submitVertexVeo({
  accessToken,
  project,
  location,
  storageUri,
  prompt,
  imageBase64,
  referenceImages,
  durationSeconds,
}) {
  const parameters = {
    sampleCount: 1,
    aspectRatio: '16:9',
    durationSeconds,
    resolution: RESOLUTION,
    personGeneration: 'disallow',
    ...(storageUri ? { storageUri } : {}),
  }
  const instance = {
    prompt,
    ...(referenceImages?.length
      ? {
          referenceImages: referenceImages.map((image) => ({
            image,
            referenceType: 'asset',
          })),
        }
      : imageBase64
      ? {
          image: {
            bytesBase64Encoded: imageBase64,
            mimeType: 'image/png',
          },
        }
      : {}),
  }

  const res = await fetch(getVertexModelUrl(project, location) + ':predictLongRunning', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      instances: [instance],
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

async function submitVeo({ prompt, imageBase64 }) {
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
          prompt,
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
