-- OpenClaw pipeline foundation: raw prospects + future-safe video URL field.

CREATE TABLE IF NOT EXISTS public.prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Parcel data
    address TEXT NOT NULL,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    parcel_id TEXT,
    owner_llc TEXT,
    sqft NUMERIC,
    year_built INTEGER,
    use_code TEXT,
    county TEXT,
    metro TEXT,

    -- Solar data
    panel_count INTEGER,
    system_kw NUMERIC,
    yearly_kwh NUMERIC,
    annual_savings NUMERIC,
    system_cost NUMERIC,
    federal_itc NUMERIC,
    payback_years NUMERIC,
    satellite_url TEXT,
    render_url TEXT,
    solar_quality TEXT CHECK (solar_quality IS NULL OR solar_quality IN ('google_solar', 'fallback')),

    -- Owner enrichment
    owner_name TEXT,
    owner_title TEXT,
    owner_email TEXT,
    owner_phone TEXT,
    owner_linkedin TEXT,
    email_confidence NUMERIC,
    enrichment_source TEXT,

    -- Outreach state
    pipeline_stage TEXT NOT NULL DEFAULT 'sourced' CHECK (
        pipeline_stage IN (
            'sourced',
            'solar_fetched',
            'enriched',
            'microsite_live',
            'emailed',
            'replied',
            'booked',
            'snoozed',
            'dead'
        )
    ),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    video_url TEXT,
    microsite_slug TEXT,

    -- Outreach log
    email_sent_at TIMESTAMPTZ,
    email_day3_sent_at TIMESTAMPTZ,
    sms_sent_at TIMESTAMPTZ,
    reply_received_at TIMESTAMPTZ,
    reply_classification TEXT,
    booked_at TIMESTAMPTZ,

    -- Meta
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS video_url TEXT;

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access to prospects" ON public.prospects;
CREATE POLICY "Admins have full access to prospects" ON public.prospects
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_parcel_id
    ON public.prospects(parcel_id)
    WHERE parcel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_stage ON public.prospects(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_prospects_metro ON public.prospects(metro);
CREATE INDEX IF NOT EXISTS idx_prospects_created_at ON public.prospects(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_prospects_updated_at ON public.prospects;
CREATE TRIGGER set_prospects_updated_at
    BEFORE UPDATE ON public.prospects
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Create the public Storage bucket when migrations run through Supabase.
INSERT INTO storage.buckets (id, name, public)
VALUES ('prospects', 'prospects', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
