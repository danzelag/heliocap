import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type SourceLeadsPayload = {
  metro?: string
  query?: string
  limit?: number
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const webhookUrl = process.env.N8N_SOURCE_LEADS_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'N8N_SOURCE_LEADS_WEBHOOK_URL is not configured' },
        { status: 500 }
      )
    }

    const body = (await request.json()) as SourceLeadsPayload
    const metro = body.metro?.trim()
    const query = body.query?.trim()
    const limit = Number(body.limit || 25)

    if (!metro) {
      return NextResponse.json({ error: 'metro is required' }, { status: 400 })
    }
    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }
    if (!Number.isFinite(limit) || limit < 1 || limit > 250) {
      return NextResponse.json({ error: 'limit must be between 1 and 250' }, { status: 400 })
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (process.env.N8N_WEBHOOK_SECRET) {
      headers.Authorization = `Bearer ${process.env.N8N_WEBHOOK_SECRET}`
    }

    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        metro,
        query,
        limit,
        source: 'heliocap-admin',
      }),
      cache: 'no-store',
    })

    const responseText = await n8nResponse.text()
    const receipt = parseJsonReceipt(responseText)

    if (!n8nResponse.ok) {
      return NextResponse.json(
        {
          error: receipt?.error || receipt?.message || `n8n returned ${n8nResponse.status}`,
          receipt,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      receipt,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[source-leads]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function parseJsonReceipt(value: string) {
  if (!value) return null

  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return { message: value }
  }
}
