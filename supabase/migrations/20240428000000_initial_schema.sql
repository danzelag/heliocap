-- Initial schema for Helio Cap

-- Create tables
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    contact_name TEXT,
    address TEXT,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    roof_image_url TEXT,
    render_image_url TEXT,
    estimated_savings NUMERIC,
    notes TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cta_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leads
-- Public can only view published leads
CREATE POLICY "Public can view published leads" ON public.leads
    FOR SELECT USING (status = 'published');

-- Admins (service role or authenticated admins) can do everything
CREATE POLICY "Admins have full access to leads" ON public.leads
    FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- RLS Policies for cta_submissions
-- Public can insert submissions
CREATE POLICY "Public can insert submissions" ON public.cta_submissions
    FOR INSERT WITH CHECK (true);

-- Admins can view submissions
CREATE POLICY "Admins can view submissions" ON public.cta_submissions
    FOR SELECT USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- RLS Policies for page_views
-- Public can insert page views
CREATE POLICY "Public can insert page views" ON public.page_views
    FOR INSERT WITH CHECK (true);

-- Admins can view page views
CREATE POLICY "Admins can view page views" ON public.page_views
    FOR SELECT USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');
