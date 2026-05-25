import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEPLOYMENT_URL =
  process.env.HERO_VIDEO_DEPLOYMENT_URL ||
  'https://heliocap.vercel.app'
const OUTPUT_VIDEO = 'public/hero/house-solar-hero.mp4'

async function main() {
  const token = process.env.HERO_VIDEO_SHARED_SECRET?.trim()
  if (!token) throw new Error('HERO_VIDEO_SHARED_SECRET is required')

  mkdirSync('public/hero', { recursive: true })

  const submit = JSON.parse(
    await vercelCurlJson(token, {
      action: 'submit',
    }),
  )

  const operationName = submit.operationName
  if (!operationName || typeof operationName !== 'string') {
    throw new Error(`Submit returned no operationName: ${JSON.stringify(submit)}`)
  }

  console.log(`Submitted operation: ${operationName}`)

  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await sleep(10_000)
    const status = JSON.parse(
      await vercelCurlJson(token, {
        action: 'status',
        operationName,
      }),
    )
    console.log(`Status ${attempt}: done=${status.done === true} failed=${status.failed === true}`)

    if (status.failed) {
      throw new Error(`Remote generation failed: ${JSON.stringify(status.error ?? status)}`)
    }

    if (status.done !== true) continue

    const buffer = await vercelCurlBinary(token, {
      action: 'download',
      operationName,
    })

    writeFileSync(OUTPUT_VIDEO, buffer)
    console.log(`Saved ${OUTPUT_VIDEO} (${buffer.length} bytes)`)
    return
  }

  throw new Error('Timed out waiting for deployed Veo generation')
}

async function vercelCurlJson(token, body) {
  const { stdout, stderr } = await execFileAsync(
    'npx',
    [
      'vercel',
      'curl',
      '/api/hero-video',
      '--deployment',
      DEPLOYMENT_URL,
      '--',
      '--silent',
      '--show-error',
      '--request',
      'POST',
      '--header',
      `x-hero-auth: ${token}`,
      '--header',
      'Content-Type: application/json',
      '--data',
      JSON.stringify(body),
    ],
    { maxBuffer: 20 * 1024 * 1024, encoding: 'utf8' },
  )

  if (stderr?.trim()) {
    console.error(stderr.trim())
  }

  return stdout.trim()
}

async function vercelCurlBinary(token, body) {
  const { stdout, stderr } = await execFileAsync(
    'npx',
    [
      'vercel',
      'curl',
      '/api/hero-video',
      '--deployment',
      DEPLOYMENT_URL,
      '--',
      '--silent',
      '--show-error',
      '--request',
      'POST',
      '--header',
      `x-hero-auth: ${token}`,
      '--header',
      'Content-Type: application/json',
      '--data',
      JSON.stringify(body),
    ],
    { maxBuffer: 200 * 1024 * 1024, encoding: 'buffer' },
  )

  if (stderr?.length) {
    console.error(stderr.toString('utf8').trim())
  }

  return stdout
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
