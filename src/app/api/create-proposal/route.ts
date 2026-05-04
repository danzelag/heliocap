import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'

type CreateProposalPayload = {
  business_name?: string
  address?: string
  lat?: number
  lng?: number
  slug?: string
}

const DEFAULT_SITE_URL = 'https://heliocap.vercel.app'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const webhookUrl = process.env.N8N_CREATE_PROPOSAL_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json(
        { error: 'N8N_CREATE_PROPOSAL_WEBHOOK_URL is not configured' },
        { status: 500 }
      )
    }

    const body = (await request.json()) as CreateProposalPayload
    const businessName = body.business_name?.trim()
    const address = body.address?.trim()
    const lat = Number(body.lat)
    const lng = Number(body.lng)

    if (!businessName) {
      return NextResponse.json({ error: 'business_name is required' }, { status: 400 })
    }
    if (!address) {
      return NextResponse.json({ error: 'address is required' }, { status: 400 })
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: 'valid lat and lng are required' }, { status: 400 })
    }

    const slug = body.slug?.trim()
      ? SolarUtils.generateSlug(body.slug)
      : SolarUtils.generateSlug(businessName)

    if (!slug) {
      return NextResponse.json({ error: 'slug could not be generated' }, { status: 400 })
    }

    const payload = {
      business_name: businessName,
      address,
      lat,
      lng,
      slug,
    }

    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

    const receiptSlug = typeof receipt?.slug === 'string' ? receipt.slug : slug
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '')
    const proposalUrl = getReceiptUrl(receipt) || `${siteUrl}/proposal/${receiptSlug}`

    return NextResponse.json({
      success: true,
      slug: receiptSlug,
      url: proposalUrl,
      proposal_url: proposalUrl,
      receipt,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[create-proposal]', message)
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

function getReceiptUrl(receipt: Record<string, unknown> | null) {
  if (!receipt) return null

  const candidates = [receipt.url, receipt.proposal_url, receipt.proposalUrl]
  const url = candidates.find((value): value is string => typeof value === 'string' && value.length > 0)

  return url || null
}
