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

    const adminSupabase = await createAdminClient()
    const { data: job, error: jobError } = await adminSupabase
      .from('proposal_jobs')
      .insert([{
        business_name: businessName,
        address,
        lat,
        lng,
        slug,
        status: 'queued',
        current_step: 'Queued in Helio Cap',
        progress_percent: 2,
        created_by: user.id,
      }])
      .select('id, status, current_step, progress_percent, proposal_url, slug, error_message')
      .single()

    if (jobError) throw jobError

    const n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        job_id: job.id,
      }),
      cache: 'no-store',
    })

    const responseText = await n8nResponse.text()
    const receipt = parseJsonReceipt(responseText)

    if (!n8nResponse.ok) {
      await adminSupabase
        .from('proposal_jobs')
        .update({
          status: 'failed',
          current_step: 'n8n rejected the job',
          progress_percent: 100,
          error_message: getReceiptMessage(receipt) || `n8n returned ${n8nResponse.status}`,
          receipt,
        })
        .eq('id', job.id)

      return NextResponse.json(
        {
          error: getReceiptMessage(receipt) || `n8n returned ${n8nResponse.status}`,
          job_id: job.id,
          receipt,
        },
        { status: 502 }
      )
    }

    await adminSupabase
      .from('proposal_jobs')
      .update({
        status: 'running',
        current_step: 'n8n workflow started',
        progress_percent: 8,
        receipt,
      })
      .eq('id', job.id)

    return NextResponse.json({
      success: true,
      job_id: job.id,
      job,
      slug,
      receipt,
    }, { status: 202 })
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

function getReceiptMessage(receipt: Record<string, unknown> | null) {
  if (!receipt) return null

  const candidates = [receipt.error, receipt.message]
  const message = candidates.find((value): value is string => typeof value === 'string' && value.length > 0)

  return message || null
}
