-- Residential + commercial proposal restructure.
-- Additive migration for an existing OpenClaw prospects table.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposal_type') then
    create type proposal_type as enum ('residential', 'commercial');
  end if;
end $$;

alter table prospects
  add column if not exists proposal_type proposal_type not null default 'commercial',
  add column if not exists contact_name text,
  add column if not exists include_solar boolean not null default true,
  add column if not exists include_ev boolean not null default false,
  add column if not exists include_heat_pump boolean not null default false,
  add column if not exists monthly_energy_bill integer,
  add column if not exists interested_solar boolean,
  add column if not exists interested_heat_pump boolean,
  add column if not exists interested_ev boolean,
  add column if not exists heat_pump_annual_savings integer,
  add column if not exists insurance_quote_consent boolean,
  add column if not exists insurance_consent_at timestamptz,
  add column if not exists property_type text,
  add column if not exists current_heating_system text,
  add column if not exists current_cooling text,
  add column if not exists ductwork text,
  add column if not exists home_size text,
  add column if not exists main_goal text,
  add column if not exists timeline text,
  add column if not exists gas_bill_range text,
  add column if not exists hydro_bill_range text,
  add column if not exists rebate_financing_interest text,
  add column if not exists furnace_ac_age text,
  add column if not exists comfort_issue text,
  add column if not exists electrical_panel text,
  add column if not exists ownership_status text,
  add column if not exists decision_maker text,
  add column if not exists solar_status text,
  add column if not exists google_place_id text,
  add column if not exists ev_charger_count integer,
  add column if not exists ev_charger_annual_value integer,
  add column if not exists ev_charger_notes text,
  add column if not exists ev_video_url text,
  add column if not exists ev_video_thumbnail_url text;

alter table prospects alter column company_name drop not null;

update prospects
set proposal_type = 'commercial'
where proposal_type is null;

create index if not exists prospects_proposal_type_idx on prospects(proposal_type);
