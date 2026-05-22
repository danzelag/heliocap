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
  visual_lat: number | null
  visual_lng: number | null
  visual_verified: boolean | null
  visual_verified_at: string | null
  visual_review_note: string | null
  visual_zoom: number | null
  visual_preview_url: string | null
  visual_reference_exclusions: string[] | null
  solar_reference_enabled: boolean | null
  solar_reference_lat: number | null
  solar_reference_lng: number | null
  solar_reference_zoom: number | null
  solar_reference_url: string | null
  solar_reference_updated_at: string | null
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
  first_name: string | null
  last_name: string | null
  homeowner_email: string | null
  homeowner_phone: string | null
  monthly_hydro_bill: number | null
  annual_kwh: number | null
  heating_type: string | null
  has_ev: boolean | null
  ev_interest: boolean | null
  heat_pump_interest: boolean | null
  solar_interest: boolean | null
  ev_charger_interest: boolean | null
  home_type: string | null
  owns_home: boolean | null
  timeline: string | null
  financing_interest: boolean | null
  consent_to_contact: boolean | null
  intake_notes: string | null
  lead_source: string | null
  bundle_interest: Record<string, unknown> | null
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

export type ProspectVisualTarget = {
  lat: number
  lng: number
  source: 'visual_verified'
  originalLat: number
  originalLng: number
  geocodeLat: number | null
  geocodeLng: number | null
  visualLat: number | null
  visualLng: number | null
  coordinateQuality: string | null
  driftMeters: number | null
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

export function resolveProspectVisualTarget(prospect: Prospect): ProspectVisualTarget | null {
  if (
    prospect.visual_verified !== true ||
    typeof prospect.visual_lat !== 'number' ||
    typeof prospect.visual_lng !== 'number'
  ) {
    return null
  }

  return {
    lat: prospect.visual_lat,
    lng: prospect.visual_lng,
    source: 'visual_verified',
    originalLat: typeof prospect.lat === 'number' ? prospect.lat : prospect.visual_lat,
    originalLng: typeof prospect.lng === 'number' ? prospect.lng : prospect.visual_lng,
    geocodeLat: prospect.geocode_lat,
    geocodeLng: prospect.geocode_lng,
    visualLat: prospect.visual_lat,
    visualLng: prospect.visual_lng,
    coordinateQuality: prospect.coordinate_quality,
    driftMeters: prospect.coordinate_drift_meters,
  }
}

export function getProspectVisualCandidate(prospect: Prospect) {
  if (
    prospect.visual_lat != null &&
    prospect.visual_lng != null &&
    Number.isFinite(prospect.visual_lat) &&
    Number.isFinite(prospect.visual_lng)
  ) {
    return {
      lat: prospect.visual_lat,
      lng: prospect.visual_lng,
      source: 'saved_visual' as const,
    }
  }

  const canUseGeocode =
    (prospect.coordinate_quality === 'validated' || prospect.coordinate_quality === 'moderate_drift') &&
    prospect.geocode_lat != null &&
    prospect.geocode_lng != null &&
    Number.isFinite(prospect.geocode_lat) &&
    Number.isFinite(prospect.geocode_lng)

  if (canUseGeocode) {
    return {
      lat: prospect.geocode_lat!,
      lng: prospect.geocode_lng!,
      source: 'geocode_coordinates' as const,
    }
  }

  if (
    prospect.lat != null &&
    prospect.lng != null &&
    Number.isFinite(prospect.lat) &&
    Number.isFinite(prospect.lng)
  ) {
    return {
      lat: prospect.lat,
      lng: prospect.lng,
      source: 'prospect_coordinates' as const,
    }
  }

  return null
}
