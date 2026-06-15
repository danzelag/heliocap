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
