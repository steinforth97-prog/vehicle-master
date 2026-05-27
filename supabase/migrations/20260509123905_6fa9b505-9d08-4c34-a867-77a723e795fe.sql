ALTER TABLE public.vehicle_images
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 days');

CREATE INDEX IF NOT EXISTS vehicle_images_expires_at_idx ON public.vehicle_images (expires_at);