import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SERVICE_ACCOUNT_PATH = '/Users/danzelgaminde/Downloads/heliocap-d8c7671440da.json'
const PRODUCTION_URL = 'https://heliocap.vercel.app/api/hero-video'
const OUTPUT_VIDEO = 'public/hero/house-solar-hero.mp4'

async function main() {
  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(`Missing service account JSON at ${SERVICE_ACCOUNT_PATH}`)
  }

  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
  const token = createHash('sha256').update(serviceAccount.private_key).digest('hex')

  mkdirSync('public/hero', { recursive: true })

  const submit = await postJson(token, { action: 'submit' })
  const operationName = submit.operationName
  if (!operationName || typeof operationName !== 'string') {
    throw new Error(`Submit returned no operationName: ${JSON.stringify(submit)}`)
  }

  console.log(`Submitted operation: ${operationName}`)

  for (let attempt = 1; attempt <= 90; attempt += 1) {
    await sleep(10_000)
    const status = await postJson(token, { action: 'status', operationName })
    console.log(`Status ${attempt}: done=${status.done === true} failed=${status.failed === true}`)

    if (status.failed) {
      throw new Error(`Remote generation failed: ${JSON.stringify(status.error ?? status)}`)
    }

    if (status.done !== true) continue

    const downloadRes = await fetch(PRODUCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hero-auth': token,
      },
      body: JSON.stringify({ action: 'download', operationName }),
    })

    if (!downloadRes.ok) {
      const text = await downloadRes.text()
      throw new Error(`Download failed: ${downloadRes.status} ${text.slice(0, 800)}`)
    }

    const buffer = Buffer.from(await downloadRes.arrayBuffer())
    writeFileSync(OUTPUT_VIDEO, buffer)
    console.log(`Saved ${OUTPUT_VIDEO} (${buffer.length} bytes)`)
    return
  }

  throw new Error('Timed out waiting for deployed Veo generation')
}

async function postJson(token, body) {
  const res = await fetch(PRODUCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hero-auth': token,
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${res.status} ${text.slice(0, 1200)}`)
  }

  return JSON.parse(text)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
