-- Expand lead status from page-publication state to simple deal lifecycle state.
-- Existing drafts are generated proposals in the old model, so keep them visible.
UPDATE public.leads
SET status = 'published'
WHERE status = 'draft';

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.leads'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.leads DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.leads
  ALTER COLUMN status SET DEFAULT 'published',
  ADD CONSTRAINT leads_status_check CHECK (
    status IN ('published', 'contacted', 'emailed', 'replied', 'booked', 'archived')
  );

CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
