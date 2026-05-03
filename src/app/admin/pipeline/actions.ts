'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase-server'
import { SolarUtils } from '@/lib/solar-utils'
import { prospectStages, type ProspectStage } from '@/lib/prospect'

function isProspectStage(value: string): value is ProspectStage {
  return prospectStages.includes(value as ProspectStage)
}

async function getUniqueSlug(baseValue: string) {
  const supabase = await createAdminClient()
  const baseSlug = SolarUtils.generateSlug(baseValue)
  let slug = baseSlug

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (error) throw error
    if (!data) return slug
    slug = `${baseSlug}-${attempt + 1}`
  }

  return `${baseSlug}-${Date.now().toString(36)}`
}

export async function updateProspectStageAction(id: string, stage: ProspectStage) {
  if (!id) return { success: false, error: 'Missing prospect ID' }
  if (!isProspectStage(stage)) return { success: false, error: 'Invalid pipeline stage' }

  const supabase = await createAdminClient()
  const { error } = await supabase
    .from('prospects')
    .update({ pipeline_stage: stage })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  return { success: true }
}

export async function publishProspectAction(id: string) {
  if (!id) return { success: false, error: 'Missing prospect ID' }

  const supabase = await createAdminClient()
  const { data: prospect, error: prospectError } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (prospectError) return { success: false, error: prospectError.message }
  if (!prospect) return { success: false, error: 'Prospect not found' }

  if (prospect.lead_id && prospect.microsite_slug) {
    return {
      success: true,
      lead_id: prospect.lead_id,
      slug: prospect.microsite_slug,
      url: `/proposal/${prospect.microsite_slug}`,
    }
  }

  const businessName = prospect.owner_llc || prospect.owner_name || prospect.address.split(',')[0] || 'OpenClaw Prospect'
  const slug = await getUniqueSlug(businessName)
  const savings = prospect.annual_savings
  const payback = prospect.payback_years

  const notes = [
    'OpenClaw prospect pipeline publish',
    prospect.parcel_id ? `parcel_id=${prospect.parcel_id}` : null,
    prospect.solar_quality ? `solar_quality=${prospect.solar_quality}` : null,
    prospect.panel_count ? `panels=${prospect.panel_count}` : null,
    prospect.federal_itc ? `federal_itc=${prospect.federal_itc}` : null,
    prospect.owner_email ? `owner_email=${prospect.owner_email}` : null,
  ].filter(Boolean).join('; ')

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert([{
      business_name: businessName,
      contact_name: prospect.owner_name,
      address: prospect.address,
      slug,
      roof_image_url: prospect.satellite_url,
      render_image_url: prospect.render_url || prospect.satellite_url,
      render_preview_url: prospect.render_preview_url,
      video_url: prospect.video_url,
      estimated_savings: savings,
      estimated_payback: payback,
      roof_sqft: prospect.sqft,
      utility_rate: 0.14,
      lat: prospect.lat,
      lng: prospect.lng,
      building_type: prospect.use_code || 'warehouse',
      notes,
      status: 'published',
    }])
    .select('id, slug')
    .single()

  if (leadError) return { success: false, error: leadError.message }

  const { error: updateError } = await supabase
    .from('prospects')
    .update({
      lead_id: lead.id,
      microsite_slug: lead.slug,
      pipeline_stage: 'microsite_live',
    })
    .eq('id', id)

  if (updateError) return { success: false, error: updateError.message }

  revalidatePath('/admin')
  revalidatePath('/admin/pipeline')
  revalidatePath(`/proposal/${lead.slug}`)

  return {
    success: true,
    lead_id: lead.id,
    slug: lead.slug,
    url: `/proposal/${lead.slug}`,
  }
}

export async function triggerProspectEnrichmentAction(id: string) {
  if (!id) return { success: false, error: 'Missing prospect ID' }

  const webhookUrl = process.env.N8N_ENRICH_WEBHOOK_URL
  const secret = process.env.N8N_WEBHOOK_SECRET

  if (!webhookUrl) {
    return { success: false, error: 'N8N_ENRICH_WEBHOOK_URL is not configured' }
  }
  if (!secret) {
    return { success: false, error: 'N8N_WEBHOOK_SECRET is not configured' }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ prospectId: id }),
  })

  if (!response.ok) {
    return { success: false, error: `n8n returned ${response.status}` }
  }

  return { success: true }
}
