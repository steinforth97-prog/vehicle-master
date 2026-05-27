ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS background_image_url text,
  ADD COLUMN IF NOT EXISTS background_storage_path text;