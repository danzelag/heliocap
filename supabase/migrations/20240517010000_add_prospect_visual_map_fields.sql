-- Persist the exact map framing chosen during visual verification.

ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS visual_zoom INTEGER,
ADD COLUMN IF NOT EXISTS visual_preview_url TEXT;
