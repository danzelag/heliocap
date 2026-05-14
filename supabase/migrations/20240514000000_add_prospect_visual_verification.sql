-- Require a human-verified visual target before proposal generation.

ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS visual_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS visual_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS visual_verified BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS visual_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS visual_review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_prospects_visual_verified
    ON public.prospects(visual_verified)
    WHERE visual_verified = true;
