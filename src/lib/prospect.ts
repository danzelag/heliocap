export const prospectStages = [
  'sourced',
  'coordinate_review',
  'solar_fetched',
  'enriched',
  'microsite_live',
  'emailed',
  'replied',
  'booked',
  'snoozed',
  'dead',
] as const

export type ProspectStage = (typeof prospectStages)[number]

export interface Prospect {
  id: string
  address: string
  lat: number | null
  lng: number | null
  parcel_id: string | null
  place_id: string | null
  business_name: string | null
  category: string | null
  location: string | null
  source: string | null
  coordinate_quality: string | null
  coordinate_drift_meters: number | null
  needs_review: boolean | null
  review_reason: string | null
  geocode_address: string | null
  geocode_lat: number | null
  geocode_lng: number | null
  owner_llc: string | null
  sqft: number | null
  year_built: number | null
  use_code: string | null
  county: string | null
  metro: string | null
  panel_count: number | null
  system_kw: number | null
  yearly_kwh: number | null
  annual_savings: number | null
  system_cost: number | null
  federal_itc: number | null
  payback_years: number | null
  satellite_url: string | null
  render_url: string | null
  render_preview_url: string | null
  solar_quality: 'google_solar' | 'fallback' | null
  owner_name: string | null
  owner_title: string | null
  owner_email: string | null
  owner_phone: string | null
  owner_linkedin: string | null
  email_confidence: number | null
  enrichment_source: string | null
  pipeline_stage: ProspectStage
  lead_id: string | null
  video_url: string | null
  microsite_slug: string | null
  email_sent_at: string | null
  email_day3_sent_at: string | null
  sms_sent_at: string | null
  reply_received_at: string | null
  reply_classification: string | null
  booked_at: string | null
  created_at: string
  updated_at: string
}

const prospectStageRank: Record<string, number> = {
  microsite_live: 0,
  booked: 1,
  replied: 2,
  emailed: 3,
  enriched: 4,
  solar_fetched: 5,
  sourced: 6,
  coordinate_review: 7,
  snoozed: 8,
  dead: 9,
}

export function sortProspectsForAdmin(prospects: Prospect[]) {
  return [...prospects].sort((a, b) => {
    const aDelivered = a.lead_id || a.microsite_slug ? 0 : 1
    const bDelivered = b.lead_id || b.microsite_slug ? 0 : 1
    if (aDelivered !== bDelivered) return aDelivered - bDelivered

    const stageDelta = (prospectStageRank[a.pipeline_stage] ?? 99) - (prospectStageRank[b.pipeline_stage] ?? 99)
    if (stageDelta !== 0) return stageDelta

    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
  })
}
