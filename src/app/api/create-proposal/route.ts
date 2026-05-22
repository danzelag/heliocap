import { after, NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'
import { recordProposalJobEvent } from '@/lib/proposal-job-events'
import { runInAppProposalWorkflow } from '@/lib/proposal-workflow'

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
        current_step: 'Request received',
        progress_percent: 2,
        created_by: user.id,
      }])
      .select('id, status, current_step, progress_percent, proposal_url, slug, error_message')
      .single()

    if (jobError) throw jobError
    await recordProposalJobEvent(adminSupabase, {
      jobId: job.id,
      businessName: businessName,
      status: 'queued',
      step: 'Request received',
      progressPercent: 2,
    })

    await adminSupabase
      .from('proposal_jobs')
      .update({
        status: 'running',
        current_step: 'App workflow starting',
        progress_percent: 8,
        receipt: {
          engine: 'app',
          source: 'manual_create_proposal',
          build_status: 'processing',
          build_status_label: 'Processing',
        },
      })
      .eq('id', job.id)
    await recordProposalJobEvent(adminSupabase, {
      jobId: job.id,
      businessName: businessName,
      status: 'running',
      step: 'App workflow starting',
      progressPercent: 8,
    })
    after(() => runInAppProposalWorkflow(job.id))

    return NextResponse.json({
      success: true,
      job_id: job.id,
      job,
      slug,
      receipt: { engine: 'app' },
    }, { status: 202 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[create-proposal]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
