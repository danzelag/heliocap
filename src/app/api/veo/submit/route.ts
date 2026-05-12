import { NextRequest, NextResponse } from 'next/server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { buildDefaultVeoCinematicPrompt, submitVertexVeoRender } from '@/lib/vertex-veo'

type SubmitVeoBody = {
  slug?: unknown
  prompt?: unknown
  address?: unknown
  formattedAddress?: unknown
  formatted_address?: unknown
  imageUrl?: unknown
  image_url?: unknown
  renderPreviewUrl?: unknown
  render_preview_url?: unknown
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as SubmitVeoBody
    const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
    const address = getFirstString(body.formattedAddress, body.formatted_address, body.address)
    const prompt =
      typeof body.prompt === 'string' && body.prompt.trim()
        ? body.prompt.trim()
        : buildDefaultVeoCinematicPrompt(address)
    const imageUrl = getFirstString(
      body.imageUrl,
      body.image_url,
      body.renderPreviewUrl,
      body.render_preview_url,
    )

    if (!slug) {
      return NextResponse.json({ error: 'slug is required' }, { status: 400 })
    }
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'imageUrl or render_preview_url is required' },
        { status: 400 },
      )
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[api/veo/submit] final Veo prompt', prompt)
    }

    const result = await submitVertexVeoRender({ slug, prompt, imageUrl })

    return NextResponse.json({
      slug,
      operationName: result.operationName,
      operation_name: result.operationName,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[api/veo/submit]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}
