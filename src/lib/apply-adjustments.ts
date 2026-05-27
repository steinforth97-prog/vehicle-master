import { supabase } from "@/integrations/supabase/client";
import {
  type Adjustments,
  isNeutral,
  loadImage,
  renderToCanvas,
  canvasToJpegBlob,
} from "@/lib/image-filters";

/**
 * Loads an image from its public URL, applies the given adjustments, and
 * overwrites the file at `storagePath` in `bucket` with the resulting JPEG.
 * Returns the (unchanged) public URL — caller should cache-bust.
 */
export async function applyAdjustmentsToStorage(opts: {
  bucket: string;
  url: string;
  storagePath: string;
  adjustments: Adjustments;
  quality?: number;
}): Promise<void> {
  const { bucket, url, storagePath, adjustments, quality = 0.98 } = opts;
  if (isNeutral(adjustments)) return;

  const src = url.startsWith("http") ? `${url}?cb=${Date.now()}` : url;
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  renderToCanvas(img, canvas, adjustments);
  const blob = await canvasToJpegBlob(canvas, quality);
  const file = new File([blob], "edited.jpg", { type: "image/jpeg" });
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "0",
    });
  if (error) throw error;
}
