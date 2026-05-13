-- Add coordinate validation fields for Google Places prospect sourcing.

ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS place_id TEXT,
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS source TEXT,
ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'sourced',
ADD COLUMN IF NOT EXISTS coordinate_quality TEXT,
ADD COLUMN IF NOT EXISTS coordinate_drift_meters NUMERIC,
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS review_reason TEXT,
ADD COLUMN IF NOT EXISTS geocode_address TEXT,
ADD COLUMN IF NOT EXISTS geocode_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS geocode_lng DOUBLE PRECISION;

ALTER TABLE public.prospects
DROP CONSTRAINT IF EXISTS prospects_pipeline_stage_check;

ALTER TABLE public.prospects
ADD CONSTRAINT prospects_pipeline_stage_check CHECK (
    pipeline_stage IN (
        'sourced',
        'coordinate_review',
        'solar_fetched',
        'enriched',
        'microsite_live',
        'emailed',
        'replied',
        'booked',
        'snoozed',
        'dead'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_place_id_unique
    ON public.prospects(place_id)
    WHERE place_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_coordinate_quality
    ON public.prospects(coordinate_quality);

CREATE INDEX IF NOT EXISTS idx_prospects_needs_review
    ON public.prospects(needs_review)
    WHERE needs_review = true;
