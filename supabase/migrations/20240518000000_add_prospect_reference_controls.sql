-- Store per-prospect visual reference controls for residential proposal generation.

ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS visual_reference_exclusions JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS solar_reference_enabled BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS solar_reference_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS solar_reference_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS solar_reference_zoom INTEGER,
ADD COLUMN IF NOT EXISTS solar_reference_url TEXT,
ADD COLUMN IF NOT EXISTS solar_reference_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_prospects_solar_reference_enabled
    ON public.prospects(solar_reference_enabled)
    WHERE solar_reference_enabled = true;
