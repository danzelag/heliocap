export type ProspectStage =
  | "sourced"
  | "geocoded"
  | "qualified"
  | "skipped"
  | "satellite_done"
  | "solar_done"
  | "video_done"
  | "microsite_live"
  | "emailed"
  | "followed_up"
  | "replied"
  | "booked"
  | "dead";

export type ReplyClassification =
  | "interested"
  | "not_now"
  | "wrong_person"
  | "unsubscribe"
  | "question";

export type ProposalType = "residential" | "commercial";

export interface Prospect {
  id: string;
  slug: string;
  proposal_type: ProposalType;
  company_name: string | null;
  contact_name: string | null;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  sqft: number | null;
  year_built: number | null;
  roof_age: number | null;
  industry: string | null;
  owner_name: string | null;
  owner_title: string | null;
  owner_email: string | null;
  owner_mobile: string | null;
  enrichment_confidence: number | null;
  stage: ProspectStage;
  // proposal scope
  include_solar: boolean;
  include_ev: boolean;
  include_heat_pump: boolean;
  // residential inputs
  monthly_energy_bill: number | null;
  interested_solar: boolean | null;
  interested_heat_pump: boolean | null;
  interested_ev: boolean | null;
  heat_pump_annual_savings: number | null;
  insurance_quote_consent: boolean | null;
  insurance_consent_at: string | null;
  // EV inputs
  ev_charger_count: number | null;
  ev_charger_annual_value: number | null;
  ev_charger_notes: string | null;
  // solar outputs
  panel_count: number | null;
  system_kw: number | null;
  yearly_kwh: number | null;
  yearly_savings: number | null;
  savings_25yr: number | null;
  system_cost: number | null;
  incentive_amount: number | null;
  // media
  satellite_image_url: string | null;
  panel_svg_url: string | null;
  video_url: string | null;
  video_thumbnail_url: string | null;
  ev_video_url: string | null;
  ev_video_thumbnail_url: string | null;
  microsite_url: string | null;
  // outreach
  email_sent_at: string | null;
  sms_sent_at: string | null;
  reply_classification: ReplyClassification | null;
  created_at: string;
}

export interface SolarPanel {
  center: { latitude: number; longitude: number };
  // long edge parallel (PORTRAIT) or perpendicular (LANDSCAPE) to the segment azimuth
  orientation?: "SOLAR_PANEL_ORIENTATION_UNSPECIFIED" | "LANDSCAPE" | "PORTRAIT";
  yearlyEnergyDcKwh: number;
  segmentIndex: number;
}

export interface RoofSegment {
  pitchDegrees: number;
  azimuthDegrees: number;
  stats: { areaMeters2: number; sunshineQuantiles: number[] };
  center: { latitude: number; longitude: number };
  boundingBox?: {
    sw: { latitude: number; longitude: number };
    ne: { latitude: number; longitude: number };
  };
  planeHeightAtCenterMeters?: number;
}

export interface SolarPanelConfig {
  panelsCount: number;
  yearlyEnergyDcKwh: number;
  roofSegmentSummaries: Array<{
    pitchDegrees: number;
    azimuthDegrees: number;
    panelsCount: number;
    yearlyEnergyDcKwh: number;
    segmentIndex: number;
  }>;
}

export interface SolarInsights {
  panels: SolarPanel[];
  roofSegments: RoofSegment[];
  solarPanelConfigs: SolarPanelConfig[];
  maxArrayPanelsCount: number;
  maxSunshineHoursPerYear: number;
  panelCapacityWatts: number;
  panelHeightMeters: number;
  panelWidthMeters: number;
  panelLifetimeYears: number;
  maxArrayAreaMeters2: number;
  carbonOffsetFactorKgPerMwh: number;
  wholeRoofStats: { areaMeters2: number; sunshineQuantiles: number[]; groundAreaMeters2?: number } | null;
  buildingStats: { areaMeters2: number; sunshineQuantiles: number[]; groundAreaMeters2?: number } | null;
  imageryQuality: "HIGH" | "MEDIUM" | "BASE" | null;
  imageryDate: { year: number; month: number; day: number } | null;
  imageryProcessedDate: { year: number; month: number; day: number } | null;
}

export interface PipelineResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
