ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS tech_details jsonb,
  ADD COLUMN IF NOT EXISTS tech_details_updated_at timestamptz;