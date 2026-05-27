DROP INDEX IF EXISTS public.vehicle_images_expires_at_idx;
ALTER TABLE public.vehicle_images DROP COLUMN IF EXISTS expires_at;