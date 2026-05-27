// Canvas-based image filter pipeline. All values are normalized 0 = neutral.
export type Adjustments = {
  exposure: number; brightness: number; contrast: number;
  highlights: number; shadows: number;
  saturation: number; vibrance: number;
  temperature: number; tint: number;
  clarity: number; sharpness: number; vignette: number;
};

export const NEUTRAL: Adjustments = {
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
  saturation: 0, vibrance: 0, temperature: 0, tint: 0,
  clarity: 0, sharpness: 0, vignette: 0,
};

export type Preset = { name: string; adj: Partial<Adjustments> };

export const PRESETS: Preset[] = [
  { name: "Original", adj: {} },
  { name: "Showroom", adj: { exposure: 8, contrast: 12, saturation: 10, clarity: 15, sharpness: 20, vignette: 10 } },
  { name: "Outdoor sonnig", adj: { exposure: 5, highlights: -25, shadows: 20, vibrance: 18, temperature: 6 } },
  { name: "Studio neutral", adj: { exposure: 4, contrast: 8, saturation: -5, sharpness: 25, vignette: 6 } },
  { name: "Kühl", adj: { temperature: -25, contrast: 10, clarity: 8 } },
  { name: "Warm", adj: { temperature: 22, vibrance: 12, shadows: 10 } },
  { name: "HDR Pop", adj: { contrast: 18, highlights: -35, shadows: 35, clarity: 28, vibrance: 20, sharpness: 15 } },
  { name: "S/W", adj: { saturation: -100, contrast: 15, clarity: 12 } },
];

const clamp = (v: number, a = 0, b = 255) => Math.max(a, Math.min(b, v));

export function isNeutral(a: Adjustments): boolean {
  return (Object.keys(NEUTRAL) as (keyof Adjustments)[]).every((k) => a[k] === NEUTRAL[k]);
}

export function mergePreset(base: Adjustments, preset: Partial<Adjustments>): Adjustments {
  return { ...NEUTRAL, ...preset };
}

/**
 * Per-pixel pass for effects the native Canvas `filter` API does not provide:
 * exposure (linear gain in stops), highlights/shadows tone curves,
 * white-balance (temperature/tint), vibrance, clarity (mid-tone contrast).
 *
 * Brightness, contrast, saturation and sharpness are handled by
 * `renderToCanvas` via `ctx.filter` so they behave like Lightroom/Photoshop
 * (perceptually correct, no premature clipping).
 */
export function applyAdjustments(img: ImageData, a: Adjustments): ImageData {
  const d = img.data;
  // Exposure in stops: ±100 slider = ±1 stop (×2 / ÷2). Apply as linear gain.
  const expF = a.exposure !== 0 ? Math.pow(2, a.exposure / 100) : 1;
  const vib = a.vibrance / 100;
  const hi = a.highlights / 100;
  const sh = a.shadows / 100;
  const tempR = a.temperature * 0.4;
  const tempB = -a.temperature * 0.4;
  const tintG = -a.tint * 0.3;
  const clarityF = a.clarity / 100;

  const needsPixelPass =
    expF !== 1 || hi !== 0 || sh !== 0 ||
    a.temperature !== 0 || a.tint !== 0 || vib !== 0 || clarityF !== 0;

  if (needsPixelPass) {
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];

      // White balance
      if (a.temperature !== 0) { r += tempR; b += tempB; }
      if (a.tint !== 0) { g += tintG; }

      // Exposure (linear gain)
      if (expF !== 1) { r *= expF; g *= expF; b *= expF; }

      // Highlights / shadows — tone-mapped by luminance weight
      if (hi !== 0 || sh !== 0) {
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (hi !== 0) {
          const w = lum * lum;
          const k = hi * 70 * w;
          r += k; g += k; b += k;
        }
        if (sh !== 0) {
          const w = (1 - lum) * (1 - lum);
          const k = sh * 70 * w;
          r += k; g += k; b += k;
        }
      }

      // Vibrance — boosts only less-saturated pixels
      if (vib !== 0) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const s = (mx - mn) / 255;
        const factor = 1 + vib * (1 - s);
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * factor; g = l + (g - l) * factor; b = l + (b - l) * factor;
      }

      // Clarity — mid-tone local contrast (sinusoidal S-curve)
      if (clarityF !== 0) {
        const xr = r / 255, xg = g / 255, xb = b / 255;
        r = (xr + clarityF * 0.5 * Math.sin((xr - 0.5) * Math.PI)) * 255;
        g = (xg + clarityF * 0.5 * Math.sin((xg - 0.5) * Math.PI)) * 255;
        b = (xb + clarityF * 0.5 * Math.sin((xb - 0.5) * Math.PI)) * 255;
      }

      d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
    }
  }

  if (a.vignette > 0) {
    const w = img.width, h = img.height;
    const cx = w / 2, cy = h / 2;
    const maxD = Math.sqrt(cx * cx + cy * cy);
    const strength = a.vignette / 100;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxD;
        const v = 1 - strength * Math.pow(dist, 2.4);
        const idx = (y * w + x) * 4;
        d[idx] *= v; d[idx + 1] *= v; d[idx + 2] *= v;
      }
    }
  }
  return img;
}

export function renderToCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  adj: Adjustments,
  maxSize?: number,
) {
  const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
  let w = sw, h = sh;
  if (maxSize && Math.max(sw, sh) > maxSize) {
    const r = maxSize / Math.max(sw, sh);
    w = Math.round(sw * r); h = Math.round(sh * r);
  }
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Use native Canvas filter for brightness/contrast/saturation/sharpness —
  // these behave like browser CSS filters (perceptually linear, no early clipping).
  const parts: string[] = [];
  if (adj.brightness !== 0) parts.push(`brightness(${100 + adj.brightness}%)`);
  if (adj.contrast !== 0) parts.push(`contrast(${100 + adj.contrast}%)`);
  if (adj.saturation !== 0) parts.push(`saturate(${Math.max(0, 100 + adj.saturation)}%)`);
  // Sharpness is approximated as a slight contrast boost.
  if (adj.sharpness > 0) parts.push(`contrast(${100 + adj.sharpness * 0.3}%)`);
  ctx.filter = parts.length ? parts.join(" ") : "none";
  ctx.drawImage(source, 0, 0, w, h);
  ctx.filter = "none";

  // Custom per-pixel pass for everything Canvas filter can't do
  const needsCustom =
    adj.exposure !== 0 || adj.highlights !== 0 || adj.shadows !== 0 ||
    adj.temperature !== 0 || adj.tint !== 0 || adj.vibrance !== 0 ||
    adj.clarity !== 0 || adj.vignette > 0;
  if (needsCustom) {
    const data = ctx.getImageData(0, 0, w, h);
    applyAdjustments(data, adj);
    ctx.putImageData(data, 0, 0);
  }
}

export function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", quality);
  });
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
