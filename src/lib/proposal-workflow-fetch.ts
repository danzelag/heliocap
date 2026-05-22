import type { ProspectLookup, WorkflowJob, AdminSupabase } from '@/lib/proposal-workflow-shared'
import { getString, getStringArray } from '@/lib/proposal-workflow-shared'

export async function getProposalWorkflowJob(
  supabase: AdminSupabase,
  jobId: string,
) {
  const { data, error } = await supabase
    .from('proposal_jobs')
    .select('id, business_name, address, lat, lng, slug, receipt')
    .eq('id', jobId)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('Proposal job not found')
  return data as WorkflowJob
}

export async function getProspect(
  supabase: AdminSupabase,
  prospectId: string,
) {
  const { data, error } = await supabase
    .from('prospects')
    .select('id,address,business_name,owner_name,owner_llc,first_name,last_name,homeowner_email,homeowner_phone,owner_email,owner_phone,sqft,annual_savings,payback_years,use_code')
    .eq('id', prospectId)
    .maybeSingle()

  if (error) throw error
  const prospect = (data as ProspectLookup | null) || null
  if (!prospect) return null

  const { data: referenceControls, error: referenceError } = await supabase
    .from('prospects')
    .select('visual_reference_exclusions,solar_reference_enabled,solar_reference_url')
    .eq('id', prospectId)
    .maybeSingle()

  if (referenceError) {
    if (referenceError.code === '42703') {
      console.warn('[proposal-workflow] Prospect reference-control columns are missing; continuing with defaults.')
      return {
        ...prospect,
        visual_reference_exclusions: [],
        solar_reference_enabled: true,
        solar_reference_url: null,
      }
    }
    throw referenceError
  }

  return {
    ...prospect,
    visual_reference_exclusions: getStringArray(referenceControls?.visual_reference_exclusions),
    solar_reference_enabled: referenceControls?.solar_reference_enabled !== false,
    solar_reference_url: getString(referenceControls?.solar_reference_url) || null,
  }
}
