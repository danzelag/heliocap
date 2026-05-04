CREATE TABLE IF NOT EXISTS public.proposal_job_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.proposal_jobs(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'completed', 'failed')
    ),
    step TEXT NOT NULL,
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),
    proposal_url TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.proposal_job_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read proposal job events" ON public.proposal_job_events;
CREATE POLICY "Admins can read proposal job events" ON public.proposal_job_events
    FOR SELECT
    TO authenticated
    USING (true);

CREATE INDEX IF NOT EXISTS idx_proposal_job_events_created_at
ON public.proposal_job_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_proposal_job_events_job_id
ON public.proposal_job_events(job_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'proposal_job_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_job_events;
    END IF;
END $$;
