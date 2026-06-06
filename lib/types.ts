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

export interface Prospect {
  id: string;
  slug: string;
  company_name: string;
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
  microsite_url: string | null;
  // outreach
  email_sent_at: string | null;
  sms_sent_at: string | null;
  reply_classification: ReplyClassification | null;
  created_at: string;
}

export interface SolarPanel {
  center: { latitude: number; longitude: number };
  orientationDegrees: number;
  yearlyEnergyDcKwh: number;
  segmentIndex: number;
}

export interface RoofSegment {
  pitchDegrees: number;
  azimuthDegrees: number;
  stats: { areaMeters2: number; sunshineQuantiles: number[] };
  center: { latitude: number; longitude: number };
}

export interface SolarInsights {
  panels: SolarPanel[];
  roofSegments: RoofSegment[];
  maxArrayPanelsCount: number;
  maxSunshineHoursPerYear: number;
}

export interface PipelineResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
