-- Store homeowner lead magnet submissions directly in prospects.

ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS homeowner_email TEXT,
ADD COLUMN IF NOT EXISTS homeowner_phone TEXT,
ADD COLUMN IF NOT EXISTS monthly_hydro_bill NUMERIC,
ADD COLUMN IF NOT EXISTS annual_kwh NUMERIC,
ADD COLUMN IF NOT EXISTS heating_type TEXT,
ADD COLUMN IF NOT EXISTS has_ev BOOLEAN,
ADD COLUMN IF NOT EXISTS ev_interest BOOLEAN,
ADD COLUMN IF NOT EXISTS heat_pump_interest BOOLEAN,
ADD COLUMN IF NOT EXISTS solar_interest BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS ev_charger_interest BOOLEAN,
ADD COLUMN IF NOT EXISTS home_type TEXT,
ADD COLUMN IF NOT EXISTS owns_home BOOLEAN,
ADD COLUMN IF NOT EXISTS timeline TEXT,
ADD COLUMN IF NOT EXISTS financing_interest BOOLEAN,
ADD COLUMN IF NOT EXISTS consent_to_contact BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS intake_notes TEXT,
ADD COLUMN IF NOT EXISTS lead_source TEXT,
ADD COLUMN IF NOT EXISTS bundle_interest JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_prospects_lead_source
    ON public.prospects(lead_source);

CREATE INDEX IF NOT EXISTS idx_prospects_homeowner_email
    ON public.prospects(homeowner_email)
    WHERE homeowner_email IS NOT NULL;
