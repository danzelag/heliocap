import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import {
  downloadVertexVeoVideo,
  fetchVertexVeoStatus,
  submitVertexVeoRender,
} from '@/lib/vertex-veo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HERO_PROMPT = `Use the uploaded reference photo as the fixed source of truth. Create a slow cinematic drone fly-over with warm golden-hour or blue-hour atmosphere, gentle upward drift, and subtle premium camera motion. Keep the exact house, rooflines, windows, driveway, neighboring homes, trees, and perspective consistent with the source image. Matte black solar panels should slowly render in only on the main home's real roof planes, appearing precise and integrated as if they are being intelligently mapped into place. Do not place panels on trees, lawns, streets, fences, garages, neighboring homes, sidewalks, the sky, or floating surfaces. Do not redesign the house, do not change the roof geometry, and do not add text, logos, signs, or watermarks. Photorealistic, refined, calm, high-end, and believable.`

type HeroVideoRequest =
  | {
      action: 'submit'
      prompt?: string
      imageBase64?: string
      imageMimeType?: string
      durationSeconds?: number
    }
  | { action: 'status'; operationName: string }
  | { action: 'download'; operationName: string }

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as Partial<HeroVideoRequest>
    const action = body.action

    if (action === 'submit') {
      const imageBuffer =
        typeof body.imageBase64 === 'string' && body.imageBase64.trim()
          ? Buffer.from(body.imageBase64, 'base64')
          : await readFile(join(process.cwd(), 'public/hero/house-solar-hero-poster.webp'))
      const operationName = await submitVertexVeoRender({
        prompt: typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : HERO_PROMPT,
        imageBuffer,
        durationSeconds:
          typeof body.durationSeconds === 'number' && body.durationSeconds > 0 ? body.durationSeconds : 8,
      })

      return NextResponse.json({ operationName })
    }

    if (action === 'status') {
      const operationName = getOperationName(body)
      const raw = await fetchVertexVeoStatus(operationName)
      const refs = extractVideoRefs(raw)

      return NextResponse.json({
        done: raw.done === true,
        failed: Boolean(raw.error),
        error: raw.error ?? null,
        gcsUri: refs.gcsUri,
        videoUrl: refs.videoUrl,
      })
    }

    if (action === 'download') {
      const operationName = getOperationName(body)
      const buffer = await downloadVertexVeoVideo(operationName)

      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': String(buffer.byteLength),
          'Content-Disposition': 'inline; filename="house-solar-hero.mp4"',
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getOperationName(body: Partial<HeroVideoRequest>) {
  if ('operationName' in body && typeof body.operationName === 'string' && body.operationName.trim()) {
    return body.operationName.trim()
  }

  throw new Error('operationName is required')
}

function isAuthorized(request: NextRequest) {
  const token = request.headers.get('x-hero-auth')?.trim()
  if (!token) return false

  const sharedSecret = process.env.HERO_VIDEO_SHARED_SECRET?.trim()
  if (!sharedSecret) return false
  return token === sharedSecret
}

function extractVideoRefs(raw: Awaited<ReturnType<typeof fetchVertexVeoStatus>>) {
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
