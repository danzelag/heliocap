import { NextRequest, NextResponse } from 'next/server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { submitVertexVeoRender } from '@/lib/vertex-veo'

type SubmitVeoBody = {
  slug?: unknown
  prompt?: unknown
  imageUrl?: unknown
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as SubmitVeoBody
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''

    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }
    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }
    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 })
    }

    const result = await submitVertexVeoRender({ slug, prompt, imageUrl })

    return NextResponse.json({
      slug,
      operationName: result.operationName,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[api/veo/submit]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
