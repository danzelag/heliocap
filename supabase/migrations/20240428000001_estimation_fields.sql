-- Add estimation fields to leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS roof_sqft NUMERIC,
ADD COLUMN IF NOT EXISTS utility_rate NUMERIC DEFAULT 0.12, -- Avg commercial rate
ADD COLUMN IF NOT EXISTS estimated_payback NUMERIC;
