-- OpenClaw database schema
-- Run in the Supabase SQL editor

create extension if not exists "uuid-ossp";

create type prospect_stage as enum (
  'sourced',
  'geocoded',
  'qualified',
  'skipped',
  'satellite_done',
  'solar_done',
  'video_done',
  'microsite_live',
  'emailed',
  'followed_up',
  'replied',
  'booked',
  'dead'
);

create type reply_classification as enum (
  'interested',
  'not_now',
  'wrong_person',
  'unsubscribe',
  'question'
);

create type proposal_type as enum (
  'residential',
  'commercial'
);

create table prospects (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,

  -- journey discriminator
  proposal_type proposal_type not null default 'commercial',

  -- building
  company_name text,
  contact_name text,
  address text not null,
  city text not null,
  lat numeric(10, 7),
  lng numeric(10, 7),
  sqft integer,
  year_built integer,
  roof_age integer generated always as (
    case when year_built is not null then extract(year from now())::integer - year_built end
  ) stored,
  industry text,

  -- owner
  owner_name text,
  owner_title text,
  owner_email text,
  owner_mobile text,
  enrichment_confidence numeric(4, 2), -- 0.00 to 1.00

  -- pipeline state
  stage prospect_stage not null default 'sourced',

  -- proposal scope
  include_solar boolean not null default true,
  include_ev boolean not null default false,
  include_heat_pump boolean not null default false,

  -- residential inputs
  monthly_energy_bill integer,
  interested_solar boolean,
  interested_heat_pump boolean,
  interested_ev boolean,
  heat_pump_annual_savings integer,
  insurance_quote_consent boolean,
  insurance_consent_at timestamptz,
  property_type text,
  current_heating_system text,
  current_cooling text,
  ductwork text,
  home_size text,
  main_goal text,
  timeline text,
  gas_bill_range text,
  hydro_bill_range text,
  rebate_financing_interest text,
  furnace_ac_age text,
  comfort_issue text,
  electrical_panel text,
  ownership_status text,
  decision_maker text,
  solar_status text,
  google_place_id text,

  -- commercial / shared EV inputs
  ev_charger_count integer,
  ev_charger_annual_value integer,
  ev_charger_notes text,

  -- solar outputs
  panel_count integer,
  system_kw numeric(8, 1),
  yearly_kwh integer,
  yearly_savings integer,
  savings_25yr integer,
  system_cost integer,
  incentive_amount integer,

  -- media
  satellite_image_url text,
  panel_svg_url text,
  video_url text,
  video_thumbnail_url text,
  ev_video_url text,
  ev_video_thumbnail_url text,
  microsite_url text,

  -- outreach
  email_sent_at timestamptz,
  sms_sent_at timestamptz,
  postcard_sent_at timestamptz,
  reply_classification reply_classification,
  snooze_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger prospects_updated_at
before update on prospects
for each row execute function update_updated_at();

-- indexes
create index prospects_stage_idx on prospects(stage);
create index prospects_proposal_type_idx on prospects(proposal_type);
create index prospects_city_idx on prospects(city);
create index prospects_created_at_idx on prospects(created_at desc);
create index prospects_slug_idx on prospects(slug);

-- RLS: service role bypasses, anon reads microsite-live rows only
alter table prospects enable row level security;

create policy "service_role_all" on prospects
  using (true)
  with check (true);

create policy "anon_read_live" on prospects
  for select
  using (stage not in ('sourced', 'dead', 'skipped'));

-- Supabase Storage bucket (run via Supabase dashboard or CLI)
-- insert into storage.buckets (id, name, public) values ('openclaw', 'openclaw', true);
