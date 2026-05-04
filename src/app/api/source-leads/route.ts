import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type SourceLeadsPayload = {
  location?: string
  category?: string
  max_results?: number
  keywords?: string
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
    const location = body.location?.trim()
    const category = body.category?.trim()
    const keywords = body.keywords?.trim()
    const maxResults = Number(body.max_results)

    if (!location) {
      return NextResponse.json({ error: 'location is required' }, { status: 400 })
    }
    if (!category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 })
    }
    if (!Number.isFinite(maxResults) || maxResults < 1 || maxResults > 250) {
      return NextResponse.json({ error: 'max_results must be between 1 and 250' }, { status: 400 })
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (process.env.N8N_WEBHOOK_SECRET) {
      headers.Authorization = `Bearer ${process.env.N8N_WEBHOOK_SECRET}`
    }

    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        location,
        category,
        max_results: maxResults,
        ...(keywords ? { keywords } : {}),
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
