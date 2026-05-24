import { revalidatePath } from 'next/cache'
import type { AdminSupabase, ProspectLookup, RoofAssets, WorkflowJob } from '@/lib/proposal-workflow-shared'
import {
  asRecord,
  buildLeadNotes,
  DEFAULT_SITE_URL,
  getContactName,
  setWorkflowProgress,
} from '@/lib/proposal-workflow-shared'
import { updateProposalJobProgress } from '@/lib/proposal-job-events'

export async function publishLead({
  supabase,
  job,
  prospect,
  roofAssets,
  renderPreviewUrl,
  renderSource,
}: {
  supabase: AdminSupabase
  job: WorkflowJob
  prospect: ProspectLookup | null
  roofAssets: RoofAssets
  renderPreviewUrl: string
  renderSource:
    | 'black_panel_reference'
    | 'clean_base_plus_solar_api_panels'
    | 'deterministic_solar_rgb_plus_solar_api_panels'
    | 'stylized_solar_design_plate'
}) {
  await setWorkflowProgress(supabase, job, {
    step: 'Publishing still proposal',
    progressPercent: 78,
    buildStatus: 'proposal_publishing',
  })

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '')
  const contactName = getContactName(prospect)
  const existingLead = await getExistingLead(supabase, job.slug)
  const currentReceipt = asRecord(job.receipt)
  const renderQuality = currentReceipt.render_approved_by
    ? 'approved'
    : typeof currentReceipt.render_quality === 'string'
      ? currentReceipt.render_quality
      : 'awaiting_review'
  const leadPayload = {
    business_name: job.business_name,
    contact_name: contactName,
    address: job.address,
    slug: job.slug,
    roof_sqft: prospect?.sqft || roofAssets.solarModel.usableRoofAreaSqft,
    utility_rate: roofAssets.solarModel.utilityRate,
    estimated_savings: prospect?.annual_savings || roofAssets.solarModel.yearlySavings,
    estimated_payback: prospect?.payback_years || roofAssets.solarModel.estimatedPayback,
    roof_image_url: roofAssets.roofImageUrl,
    render_image_url: roofAssets.renderImageUrl,
    render_preview_url: renderPreviewUrl,
    video_url: null,
    lat: roofAssets.mapCenter.lat,
    lng: roofAssets.mapCenter.lng,
    building_type: prospect?.use_code || null,
    notes: buildLeadNotes(prospect, renderSource),
    status: 'published',
  }

  const mutation = existingLead
    ? supabase.from('leads').update(leadPayload).eq('id', existingLead.id).select().single()
    : supabase.from('leads').insert([leadPayload]).select().single()

  const { data: lead, error } = await mutation
  if (error) throw error

  const proposalUrl = `${siteUrl}/proposal/${lead.slug}`
  await supabase
    .from('proposal_jobs')
    .update({
      status: 'running',
      current_step: 'Proposal published',
      progress_percent: 100,
      proposal_url: proposalUrl,
      lead_id: lead.id,
      receipt: {
        ...asRecord(job.receipt),
        build_status: 'proposal_published',
        build_status_label: 'Proposal Ready',
        engine: 'app',
        lead_id: lead.id,
        proposal_url: proposalUrl,
        render_source: renderSource,
        render_quality: renderQuality,
        render_approved_by: currentReceipt.render_approved_by || null,
        video_complete: false,
        video_optional: false,
        video_required: false,
        updated_at: new Date().toISOString(),
      },
    })
    .eq('id', job.id)

  await updateProposalJobProgress(supabase, {
    jobId: job.id,
    businessName: lead.business_name,
    status: 'running',
    step: 'Proposal published',
    progressPercent: 100,
    proposalUrl,
    leadId: lead.id,
  })

  if (prospect?.id) {
    await supabase
      .from('prospects')
      .update({
        lead_id: lead.id,
        microsite_slug: lead.slug,
        video_url: null,
        pipeline_stage: 'microsite_live',
      })
      .eq('id', prospect.id)
  }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  revalidatePath(`/proposal/${lead.slug}`)

  job.receipt = {
    ...asRecord(job.receipt),
    build_status: 'proposal_published',
    build_status_label: 'Proposal Ready',
    engine: 'app',
    lead_id: lead.id,
    proposal_url: proposalUrl,
    render_source: renderSource,
    render_quality: renderQuality,
    render_approved_by: currentReceipt.render_approved_by || null,
    video_complete: false,
    video_optional: false,
    video_required: false,
    updated_at: new Date().toISOString(),
  }
  job.proposal_url = proposalUrl

  return {
    leadId: lead.id as string,
    proposalUrl,
  }
}

async function getExistingLead(
  supabase: AdminSupabase,
  slug: string,
) {
  const { data, error } = await supabase
    .from('leads')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw error
  return data as { id: string } | null
}
