-- Add Google Place ID support to prospects for the new Google-based sourcing pipeline.
-- This replaces/complements parcel_id for uniquely identifying commercial buildings.

ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS place_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_place_id_unique
ON public.prospects(place_id)
WHERE place_id IS NOT NULL;
