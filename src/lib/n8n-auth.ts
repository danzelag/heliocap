import { NextResponse } from 'next/server'

export function verifyN8nRequest(request: Request) {
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!secret) {
    return NextResponse.json({ error: 'N8N_WEBHOOK_SECRET is not configured' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : ''

  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
