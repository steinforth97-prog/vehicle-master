// HEIC helpers: detect + convert to JPEG using heic2any (browser-only).

export function isHeic(nameOrUrl: string): boolean {
  return /\.heic($|\?)/i.test(nameOrUrl) || /\.heif($|\?)/i.test(nameOrUrl);
}

export function isHeicFile(file: File): boolean {
  if (isHeic(file.name)) return true;
  const t = (file.type || "").toLowerCase();
  return t === "image/heic" || t === "image/heif";
}

/** Convert a HEIC/HEIF file to a JPEG File. Falls back to original on error. */
export async function heicFileToJpeg(file: File, quality = 0.9): Promise<File> {
  if (!isHeicFile(file)) return file;
  if (typeof window === "undefined") return file;
  try {
    const mod = await import("heic2any");
    const heic2any = (mod as any).default ?? (mod as any);
    const out = (await heic2any({ blob: file, toType: "image/jpeg", quality })) as Blob | Blob[];
    const blob = Array.isArray(out) ? out[0] : out;
    const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg") || "image.jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (e) {
    console.warn("[heic] conversion failed, keeping original", e);
    return file;
  }
}

/** Fetch a remote HEIC URL and return a blob URL of the JPEG. */
export async function heicUrlToObjectUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  const mod = await import("heic2any");
  const heic2any = (mod as any).default ?? (mod as any);
  const out = (await heic2any({ blob, toType: "image/jpeg", quality: 0.9 })) as Blob | Blob[];
  const jpeg = Array.isArray(out) ? out[0] : out;
  return URL.createObjectURL(jpeg);
}
