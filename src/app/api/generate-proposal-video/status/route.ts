import { NextRequest, NextResponse } from 'next/server'
import { verifyN8nRequest } from '@/lib/n8n-auth'
import { checkVeoStatus } from '@/lib/veo-render'

export async function GET(request: NextRequest) {
  const authError = verifyN8nRequest(request)
  if (authError) return authError

  const op = request.nextUrl.searchParams.get('op')
  if (!op) {
    return NextResponse.json({ error: 'op query param is required' }, { status: 400 })
  }

  try {
    const result = await checkVeoStatus(op)
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-proposal-video/status]', message)
    return NextResponse.json({ done: false, failed: true, reason: message })
  }
}
