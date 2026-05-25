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

const HERO_PROMPT = `Use the uploaded reference photo as the exact home and exact scene. Create a slow cinematic fly-over slowly rotating to the left with golden hour lighting, starting from the same front exterior view and gently gliding upward and slightly across the house with smooth premium camera motion. Keep the architecture, rooflines, windows, driveway, trees, and overall property exactly consistent with the reference image. As the camera moves, matte black solar panels slowly and elegantly appear on the roof in believable positions, as if being precisely rendered into place. The panels should feel integrated, high-end, and realistic. Photorealistic luxury commercial style, calm and refined, warm evening sky, subtle atmosphere, no people, no cars, no text, no logos, no watermarks, no extra buildings, no house redesign, no added structures, no blue panels.`

type HeroVideoRequest =
  | { action: 'submit' }
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
      const imageBuffer = await readFile(join(process.cwd(), 'public/hero/house-solar-hero-poster.webp'))
      const operationName = await submitVertexVeoRender({
        prompt: HERO_PROMPT,
        imageBuffer,
        durationSeconds: 8,
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
