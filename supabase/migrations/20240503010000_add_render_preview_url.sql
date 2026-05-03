ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS render_preview_url TEXT;

ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS render_preview_url TEXT;
