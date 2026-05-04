-- Add additional sourcing fields for Google Places integration.
-- Note: place_id was added in a previous migration.
-- Note: address, lat, and lng already exist in the prospects table.

ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS business_name TEXT,
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS source TEXT;

-- We recommend using the existing 'pipeline_stage' column instead of adding a 'status' column
-- to avoid confusion with the leads status system.
