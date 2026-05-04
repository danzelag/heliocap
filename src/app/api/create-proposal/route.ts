import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase-server'
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
    const requestedAt = new Date(Date.now() - 5000).toISOString()

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
    const lead = await waitForCreatedLead({
      slug: receiptSlug,
      requestedSlug: slug,
      businessName,
      address,
      requestedAt,
    })

    if (!lead) {
      return NextResponse.json(
        {
          success: false,
          pending: true,
          error: 'n8n accepted the request, but the proposal lead is not live yet. Check the workflow run and try the dashboard again in a moment.',
          slug: receiptSlug,
          receipt,
        },
        { status: 202 }
      )
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '')
    const proposalUrl = `${siteUrl}/proposal/${lead.slug}`

    return NextResponse.json({
      success: true,
      lead_id: lead.id,
      slug: lead.slug,
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

function parseJsonReceipt(value: string): Record<string, unknown> | null {
  if (!value) return null

  try {
    return normalizeReceipt(JSON.parse(value))
  } catch {
    return { message: value }
  }
}

function normalizeReceipt(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return normalizeReceipt(value[0])
  }

  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  if (record.json && typeof record.json === 'object') return normalizeReceipt(record.json)
  if (record.body && typeof record.body === 'object') return normalizeReceipt(record.body)

  return record
}

async function waitForCreatedLead({
  slug,
  requestedSlug,
  businessName,
  address,
  requestedAt,
}: {
  slug: string
  requestedSlug: string
  businessName: string
  address: string
  requestedAt: string
}) {
  const supabase = await createAdminClient()
  const deadline = Date.now() + 12000

  while (Date.now() < deadline) {
    const exact = await findLeadBySlug(supabase, slug)
    if (exact) return exact

    const requested = requestedSlug !== slug ? await findLeadBySlug(supabase, requestedSlug) : null
    if (requested) return requested

    const { data: recentLead } = await supabase
      .from('leads')
      .select('id, slug')
      .eq('business_name', businessName)
      .eq('address', address)
      .gte('created_at', requestedAt)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentLead?.slug) return recentLead

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return null
}

async function findLeadBySlug(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  slug: string,
) {
  const { data } = await supabase
    .from('leads')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle()

  return data
}
