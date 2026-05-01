-- Add geocoordinates to leads for satellite roof image generation
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
