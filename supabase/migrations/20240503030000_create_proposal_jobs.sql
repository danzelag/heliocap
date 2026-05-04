CREATE TABLE IF NOT EXISTS public.proposal_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    address TEXT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (
        status IN ('queued', 'running', 'completed', 'failed')
    ),
    current_step TEXT NOT NULL DEFAULT 'Queued',
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),
    proposal_url TEXT,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    error_message TEXT,
    receipt JSONB,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.proposal_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read proposal jobs" ON public.proposal_jobs;
CREATE POLICY "Admins can read proposal jobs" ON public.proposal_jobs
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can create proposal jobs" ON public.proposal_jobs;
CREATE POLICY "Admins can create proposal jobs" ON public.proposal_jobs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_proposal_jobs_status ON public.proposal_jobs(status);
CREATE INDEX IF NOT EXISTS idx_proposal_jobs_created_at ON public.proposal_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_jobs_slug ON public.proposal_jobs(slug);

DROP TRIGGER IF EXISTS set_proposal_jobs_updated_at ON public.proposal_jobs;
CREATE TRIGGER set_proposal_jobs_updated_at
    BEFORE UPDATE ON public.proposal_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'proposal_jobs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_jobs;
    END IF;
END $$;
