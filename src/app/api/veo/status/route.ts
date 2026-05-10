import { NextRequest, NextResponse } from 'next/server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { fetchVertexVeoStatus } from '@/lib/vertex-veo'

type VeoStatusBody = {
  operationName?: unknown
  operation_name?: unknown
}

export async function POST(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  try {
    const body = (await request.json()) as VeoStatusBody
    const operationName =
      typeof body.operationName === 'string' && body.operationName.trim()
        ? body.operationName.trim()
        : typeof body.operation_name === 'string'
          ? body.operation_name.trim()
          : ''

    if (!operationName) {
      return NextResponse.json(
        { error: 'operationName or operation_name is required' },
        { status: 400 },
      )
    }

    const status = await fetchVertexVeoStatus(operationName)

    return NextResponse.json({
      done: status.done,
      videoUrl: status.videoUrl,
      gcsUri: status.gcsUri,
      raw: status.raw,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[api/veo/status]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
