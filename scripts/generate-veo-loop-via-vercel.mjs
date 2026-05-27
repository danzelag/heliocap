import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)
const DEFAULT_DEPLOYMENT_URL = process.env.HERO_VIDEO_DEPLOYMENT_URL || 'https://heliocap.vercel.app'
const DEFAULT_OUTPUT = 'public/hero/house-solar-hero.mp4'
const DEFAULT_DURATION_SECONDS = 8
const DEFAULT_TRANSITION_SECONDS = 1
const TARGET_WIDTH = 1920
const TARGET_HEIGHT = 1080

async function main() {
  const configPath = process.argv[2]
  if (!configPath) {
    throw new Error('Usage: node scripts/generate-veo-loop-via-vercel.mjs <config.json>')
  }

  const sharedSecret = process.env.HERO_VIDEO_SHARED_SECRET?.trim()
  if (!sharedSecret) throw new Error('HERO_VIDEO_SHARED_SECRET is required')

  const config = JSON.parse(readFileSync(resolve(configPath), 'utf8'))
  const clips = Array.isArray(config.clips) ? config.clips : []
  if (clips.length < 2) throw new Error('Config must contain at least 2 clips')

  const outputVideo = resolve(config.outputVideo || DEFAULT_OUTPUT)
  const outputDir = join(resolve(config.outputDir || 'public/hero/generated-clips'))
  const durationSeconds = Number(config.durationSeconds || DEFAULT_DURATION_SECONDS)
  const transitionSeconds = Number(config.transitionSeconds || DEFAULT_TRANSITION_SECONDS)
  const deploymentUrl = config.deploymentUrl || DEFAULT_DEPLOYMENT_URL

  mkdirSync(outputDir, { recursive: true })
  mkdirSync(dirname(outputVideo), { recursive: true })

  const renderedClips = []

  for (const [index, clip] of clips.entries()) {
    const sourcePath = resolve(String(clip.imagePath))
    const slug = slugify(clip.slug || clip.name || basename(sourcePath, extname(sourcePath)) || `clip-${index + 1}`)
    const prompt =
      typeof clip.prompt === 'string' && clip.prompt.trim()
        ? clip.prompt.trim()
        : buildPrompt(clip.name || `house ${index + 1}`)

    const prepped = await buildReferencePng(sourcePath, clip.crop)
    const outputPath = join(outputDir, `${String(index + 1).padStart(2, '0')}-${slug}.mp4`)
    const operationName = await submitClip({
      deploymentUrl,
      sharedSecret,
      prompt,
      imageBase64: prepped.toString('base64'),
      durationSeconds,
    })

    console.log(`Submitted ${slug}: ${operationName}`)
    const videoBuffer = await waitForClip({ deploymentUrl, sharedSecret, operationName })
    writeFileSync(outputPath, videoBuffer)
    console.log(`Saved ${outputPath} (${videoBuffer.length} bytes)`)
    renderedClips.push(outputPath)
  }

  await stitchLoop({
    clipPaths: renderedClips,
    outputVideo,
    durationSeconds,
    transitionSeconds,
  })

  console.log(`Loop saved to ${outputVideo}`)
}

async function buildReferencePng(sourcePath, cropConfig) {
  const image = sharp(sourcePath).rotate()
  const metadata = await image.metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  if (!width || !height) throw new Error(`Could not read image dimensions: ${sourcePath}`)

  const crop = normalizeCrop(cropConfig, width, height)

  return sharp(sourcePath)
    .rotate()
    .extract(crop)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, {
      fit: 'cover',
      position: 'center',
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6, adaptiveFiltering: false })
    .toBuffer()
}

function normalizeCrop(cropConfig, width, height) {
  const topPct = clampPct(cropConfig?.topPct)
  const rightPct = clampPct(cropConfig?.rightPct)
  const bottomPct = clampPct(cropConfig?.bottomPct)
  const leftPct = clampPct(cropConfig?.leftPct)

  const left = Math.round(width * leftPct)
  const top = Math.round(height * topPct)
  const extractedWidth = width - left - Math.round(width * rightPct)
  const extractedHeight = height - top - Math.round(height * bottomPct)

  if (extractedWidth < 64 || extractedHeight < 64) {
    throw new Error('Crop leaves too little image area')
  }

  return {
    left,
    top,
    width: extractedWidth,
    height: extractedHeight,
  }
}

function clampPct(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(0.4, number))
}

function buildPrompt(label) {
  return `Use the uploaded reference photo as the fixed source of truth for ${label}. Create a slow cinematic drone shot with subtle premium motion and gentle aerial drift. Keep the exact house, rooflines, windows, driveway, neighborhood, trees, and perspective consistent with the source image. Matte black solar panels should slowly render in only on the main home's visible roof planes, appearing precise, elegant, and physically attached to the roof. Do not place panels on trees, lawns, streets, fences, neighboring homes, garages, driveways, sidewalks, or floating in the air. Do not redesign the house, do not alter the roof geometry, and do not introduce text, logos, or watermarks. Photorealistic, refined, calm, high-end, and believable.`
}

async function submitClip({ deploymentUrl, sharedSecret, prompt, imageBase64, durationSeconds }) {
  const response = JSON.parse(
    await vercelCurlJson(deploymentUrl, sharedSecret, {
      action: 'submit',
      prompt,
      imageBase64,
      durationSeconds,
    }),
  )

  if (!response.operationName || typeof response.operationName !== 'string') {
    throw new Error(`Submit returned no operationName: ${JSON.stringify(response)}`)
  }

  return response.operationName
}

async function waitForClip({ deploymentUrl, sharedSecret, operationName }) {
  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await sleep(10_000)
    const status = JSON.parse(
      await vercelCurlJson(deploymentUrl, sharedSecret, {
        action: 'status',
        operationName,
      }),
    )

    console.log(`Status ${attempt} for ${operationName}: done=${status.done === true} failed=${status.failed === true}`)

    if (status.failed) {
      throw new Error(`Remote generation failed: ${JSON.stringify(status.error ?? status)}`)
    }

    if (status.done !== true) continue

    return vercelCurlBinary(deploymentUrl, sharedSecret, {
      action: 'download',
      operationName,
    })
  }

  throw new Error(`Timed out waiting for clip: ${operationName}`)
}

async function stitchLoop({ clipPaths, outputVideo, durationSeconds, transitionSeconds }) {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary path')

  const workDir = mkdtempSync(join(tmpdir(), 'hero-loop-'))
  const orderedInputs = [...clipPaths, clipPaths[0]]
  const trimStart = transitionSeconds
  const trimEnd = transitionSeconds + clipPaths.length * (durationSeconds - transitionSeconds)

  const filterParts = orderedInputs.map((_, index) => {
    return `[${index}:v]fps=30,scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},format=yuv420p,settb=AVTB[v${index}]`
  })

  let lastStream = '[v0]'
  for (let index = 1; index < orderedInputs.length; index += 1) {
    const outputName = index === orderedInputs.length - 1 ? 'vloop' : `vx${index}`
    const offset = index * (durationSeconds - transitionSeconds)
    filterParts.push(
      `${lastStream}[v${index}]xfade=transition=fade:duration=${transitionSeconds}:offset=${offset}[${outputName}]`,
    )
    lastStream = `[${outputName}]`
  }

  filterParts.push(`${lastStream}trim=start=${trimStart}:end=${trimEnd},setpts=PTS-STARTPTS[vout]`)

  const args = [
    '-y',
    ...orderedInputs.flatMap((clipPath) => ['-i', clipPath]),
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '[vout]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputVideo,
  ]

  try {
    const { stderr } = await execFileAsync(ffmpegPath, args, {
      cwd: workDir,
      maxBuffer: 200 * 1024 * 1024,
      encoding: 'utf8',
    })

    if (stderr?.trim()) {
      console.log(stderr.trim())
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

async function vercelCurlJson(deploymentUrl, sharedSecret, body) {
  const { stdout, stderr } = await execFileAsync(
    'npx',
    [
      'vercel',
      'curl',
      '/api/hero-video',
      '--deployment',
      deploymentUrl,
      '--',
      '--silent',
      '--show-error',
      '--request',
      'POST',
      '--header',
      `x-hero-auth: ${sharedSecret}`,
      '--header',
      'Content-Type: application/json',
      '--data',
      JSON.stringify(body),
    ],
    { maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' },
  )

  if (stderr?.trim()) console.error(stderr.trim())
  return stdout.trim()
}

async function vercelCurlBinary(deploymentUrl, sharedSecret, body) {
  const { stdout, stderr } = await execFileAsync(
    'npx',
    [
      'vercel',
      'curl',
      '/api/hero-video',
      '--deployment',
      deploymentUrl,
      '--',
      '--silent',
      '--show-error',
      '--request',
      'POST',
      '--header',
      `x-hero-auth: ${sharedSecret}`,
      '--header',
      'Content-Type: application/json',
      '--data',
      JSON.stringify(body),
    ],
    { maxBuffer: 200 * 1024 * 1024, encoding: 'buffer' },
  )

  if (stderr?.length) console.error(stderr.toString('utf8').trim())
  return stdout
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
