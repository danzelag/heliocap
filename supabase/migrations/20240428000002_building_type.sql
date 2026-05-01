-- Add building_type to leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS building_type TEXT;
