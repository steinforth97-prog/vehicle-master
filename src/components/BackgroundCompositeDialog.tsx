import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Sparkles,
  Check,
  X,
  Building2,
  Square,
  Trees,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { removeBackground } from "@imgly/background-removal";
import bgStudio from "@/assets/bg-studio.jpg";
import bgNeutral from "@/assets/bg-neutral.jpg";
import bgOutdoor from "@/assets/bg-outdoor.jpg";

const BG_PRESETS: Record<Exclude<Style, "company">, string> = {
  studio: bgStudio,
  neutral: bgNeutral,
  outdoor: bgOutdoor,
};

type Style = "studio" | "neutral" | "outdoor" | "company";

type Props = {
  motorhomeId: string;
  imageUrl: string;
  backgroundUrl: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

const STYLES: { id: Style; label: string; desc: string; icon: LucideIcon }[] = [
  { id: "studio", label: "3D-Showroom", desc: "Heller Studio-Boden", icon: Warehouse },
  { id: "neutral", label: "Neutral", desc: "Grauer Verlauf", icon: Square },
  { id: "outdoor", label: "Outdoor", desc: "Asphalt + Himmel", icon: Trees },
  { id: "company", label: "Firma", desc: "Eigener Hintergrund", icon: Building2 },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// Find tight bounding box of non-transparent pixels in the cutout
function tightBounds(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0,
    found = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }
  if (!found) return { x: 0, y: 0, w, h };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Build connected components from a binary mask (Uint8Array of 0/1).
function findComponents(mask: Uint8Array, w: number, h: number, minArea: number) {
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const comps: {
    pixels: number[];
    area: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }[] = [];
  for (let start = 0; start < w * h; start++) {
    if (visited[start] || !mask[start]) continue;
    let head = 0,
      tail = 0,
      area = 0,
      minX = w,
      minY = h,
      maxX = 0,
      maxY = 0;
    const pixels: number[] = [];
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p / w) | 0;
      pixels.push(p);
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && !visited[p - 1] && mask[p - 1]) {
        visited[p - 1] = 1;
        queue[tail++] = p - 1;
      }
      if (x < w - 1 && !visited[p + 1] && mask[p + 1]) {
        visited[p + 1] = 1;
        queue[tail++] = p + 1;
      }
      if (y > 0 && !visited[p - w] && mask[p - w]) {
        visited[p - w] = 1;
        queue[tail++] = p - w;
      }
      if (y < h - 1 && !visited[p + w] && mask[p + w]) {
        visited[p + w] = 1;
        queue[tail++] = p + w;
      }
    }
    if (area >= minArea) comps.push({ pixels, area, minX, minY, maxX, maxY });
  }
  return comps;
}

// Erode binary mask by `iters` pixels (4-neighbour). Breaks thin bridges
// that connect the vehicle to nearby building/foliage in the raw alpha mask.
function erode(mask: Uint8Array, w: number, h: number, iters: number) {
  let cur = mask;
  for (let it = 0; it < iters; it++) {
    const next = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (cur[p] && cur[p - 1] && cur[p + 1] && cur[p - w] && cur[p + w]) next[p] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

function isolateVehicleMask(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // Binary alpha map of the raw cutout
  const alphaMask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (d[p * 4 + 3] > 34) alphaMask[p] = 1;

  // Morphological opening: erode to break thin bridges to background objects,
  // then use the surviving cores as seeds for the real vehicle component.
  const erodePx = Math.max(3, Math.round(Math.min(w, h) * 0.012));
  const eroded = erode(alphaMask, w, h, erodePx);
  const cores = findComponents(eroded, w, h, 200);
  if (!cores.length) return; // mask too thin — leave as-is

  // Score cores: prefer large, wide, near bottom-center.
  const cx = w / 2;
  const scored = cores
    .map((c) => {
      const cw = c.maxX - c.minX + 1;
      const ch = c.maxY - c.minY + 1;
      const ccx = (c.minX + c.maxX) / 2;
      const bottomFactor = 0.3 + 0.7 * (c.maxY / h);
      const wideFactor = Math.min(1.4, Math.max(0.3, cw / Math.max(ch, 1)) / 2.0);
      const centerFactor = 1 - Math.min(1, Math.abs(ccx - cx) / (w / 2)) * 0.4;
      const topPenalty = c.minY < h * 0.05 ? 0.3 : 1;
      return { c, score: c.area * bottomFactor * wideFactor * centerFactor * topPenalty };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0].c;

  // Re-grow ONLY from the chosen core by flood-filling the original alpha mask
  // starting at the core's pixels. This recovers fine vehicle parts (mirrors,
  // antennas, wheels) that survived in the raw mask but were eroded away —
  // without recovering the building, whose bridge to the vehicle was severed.
  const keep = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  for (const p of best.pixels) {
    if (!keep[p] && alphaMask[p]) {
      keep[p] = 1;
      queue[tail++] = p;
    }
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0 && !keep[p - 1] && alphaMask[p - 1]) {
      keep[p - 1] = 1;
      queue[tail++] = p - 1;
    }
    if (x < w - 1 && !keep[p + 1] && alphaMask[p + 1]) {
      keep[p + 1] = 1;
      queue[tail++] = p + 1;
    }
    if (y > 0 && !keep[p - w] && alphaMask[p - w]) {
      keep[p - w] = 1;
      queue[tail++] = p - w;
    }
    if (y < h - 1 && !keep[p + w] && alphaMask[p + w]) {
      keep[p + w] = 1;
      queue[tail++] = p + w;
    }
  }

  // Compute the kept bbox, then aggressively cull anything outside a tight
  // margin — kills isolated building/foliage blobs still in the raw mask.
  let minX = w,
    minY = h,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (keep[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const marginX = Math.round((maxX - minX) * 0.04);
  const marginY = Math.round((maxY - minY) * 0.04);
  const bx0 = Math.max(0, minX - marginX);
  const by0 = Math.max(0, minY - marginY);
  const bx1 = Math.min(w - 1, maxX + marginX);
  const by1 = Math.min(h - 1, maxY + marginY);

  for (let y = 0; y < h; y++) {
    const outsideBand = y < by0 || y > by1;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!keep[p] || outsideBand || x < bx0 || x > bx1) d[p * 4 + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function findGroundOffset(
  canvas: HTMLCanvasElement,
  bbox: { x: number; y: number; w: number; h: number },
) {
  const ctx = canvas.getContext("2d")!;
  const data = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h).data;
  const bottomPixels: number[] = [];
  for (let x = 0; x < bbox.w; x++) {
    for (let y = bbox.h - 1; y >= 0; y--) {
      if (data[(y * bbox.w + x) * 4 + 3] > 48) {
        bottomPixels.push(y);
        break;
      }
    }
  }
  if (!bottomPixels.length) return bbox.h;
  bottomPixels.sort((a, b) => a - b);
  return bottomPixels[Math.floor(bottomPixels.length * 0.96)] + 1;
}

// Edge cleanup: kill thin halo (low-alpha fringe) and snap mostly-opaque pixels
// to fully opaque so we don't see translucent edges on bright backgrounds.
function refineMask(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // Pass 1: threshold cleanup
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    if (a < 40)
      d[i] = 0; // drop faint fringe
    else if (a > 235) d[i] = 255; // snap near-opaque to solid
  }
  // Pass 2: erode 1px — any opaque pixel with a transparent neighbour becomes semi
  // (smooths jagged edges instead of leaving a stair-step halo).
  const src = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4 + 3;
      if (src[i] !== 255) continue;
      // check 4-neighbours
      if (src[i - 4] === 0 || src[i + 4] === 0 || src[i - w * 4] === 0 || src[i + w * 4] === 0) {
        d[i] = 180;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  bgImg: HTMLImageElement,
  brightnessPct: number,
) {
  const brightness = 1 + brightnessPct / 100;
  ctx.save();
  ctx.filter = `brightness(${brightness})`;
  const scale = Math.max(W / bgImg.width, H / bgImg.height);
  const dw = bgImg.width * scale;
  const dh = bgImg.height * scale;
  ctx.drawImage(bgImg, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();
}

function drawShadow(ctx: CanvasRenderingContext2D, cx: number, baseY: number, vw: number) {
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#000";
  ctx.filter = "blur(18px)";
  ctx.beginPath();
  ctx.ellipse(cx, baseY, vw * 0.48, vw * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function BackgroundCompositeDialog({
  motorhomeId,
  imageUrl,
  backgroundUrl,
  onClose,
  onSaved,
}: Props) {
  const [style, setStyle] = useState<Style>("studio");
  const [brightness, setBrightness] = useState(10);
  const [scale, setScale] = useState(95); // % of available width
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // cutout cache so we only run background-removal once per image
  const cutoutRef = useRef<{
    canvas: HTMLCanvasElement;
    bbox: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const presetCacheRef = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    cutoutRef.current = null;
    setResult(null);
  }, [imageUrl]);

  useEffect(() => {
    if (!backgroundUrl) {
      bgImgRef.current = null;
      return;
    }
    loadImage(backgroundUrl)
      .then((img) => {
        bgImgRef.current = img;
      })
      .catch(() => {});
  }, [backgroundUrl]);

  async function getBgImage(): Promise<HTMLImageElement> {
    if (style === "company") {
      if (!bgImgRef.current) throw new Error("Kein Firmenhintergrund");
      return bgImgRef.current;
    }
    const url = BG_PRESETS[style];
    if (presetCacheRef.current[url]) return presetCacheRef.current[url];
    const img = await loadImage(url);
    presetCacheRef.current[url] = img;
    return img;
  }

  async function ensureCutout() {
    if (cutoutRef.current) return cutoutRef.current;
    const tId = toast.loading("Lade Freistell-Modell…");
    let lastStage = "";
    try {
      const blob = await removeBackground(imageUrl, {
        device: "gpu",
        model: "isnet",
        output: { format: "image/png", quality: 1 },
        progress: (key, current, total) => {
          const stage = key.startsWith("fetch")
            ? "Modell wird geladen"
            : "Fahrzeug wird freigestellt";
          const pct = total ? Math.round((current / total) * 100) : 0;
          if (stage !== lastStage || pct % 10 === 0) {
            lastStage = stage;
            toast.loading(`${stage}… ${pct}%`, { id: tId });
          }
        },
      });
      toast.dismiss(tId);
      const url = URL.createObjectURL(blob);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const cx = c.getContext("2d")!;
      cx.drawImage(img, 0, 0);
      refineMask(cx, c.width, c.height);
      isolateVehicleMask(cx, c.width, c.height);
      const bbox = tightBounds(c);
      cutoutRef.current = { canvas: c, bbox };
      return cutoutRef.current;
    } catch (e) {
      toast.dismiss(tId);
      throw e;
    }
  }

  const generate = async () => {
    if (style === "company" && !bgImgRef.current) {
      toast.error("Bitte zuerst einen Firmenhintergrund in den Einstellungen hochladen.");
      return;
    }
    setBusy(true);
    try {
      const { canvas: cutCanvas, bbox } = await ensureCutout();

      // Output 16:9 sized off the source for good resolution
      const srcAspect = bbox.w / bbox.h;
      const W = Math.max(1280, Math.round(bbox.w * 1.4));
      const H = Math.round((W * 9) / 16);
      const out = document.createElement("canvas");
      out.width = W;
      out.height = H;
      const ctx = out.getContext("2d")!;

      const bgImg = await getBgImage();
      drawBackground(ctx, W, H, bgImg, brightness);

      // Fit vehicle: keep aspect, fill chosen % of width, but also cap by height
      const maxW = W * (scale / 100);
      const maxH = H * 0.82;
      let drawW = maxW;
      let drawH = drawW / srcAspect;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * srcAspect;
      }
      const cx = W / 2;
      const groundY = H * 0.88;
      const drawX = cx - drawW / 2;
      const groundOffset = findGroundOffset(cutCanvas, bbox);
      const drawY = groundY - (groundOffset / bbox.h) * drawH;

      drawShadow(ctx, cx, groundY + 4, drawW);

      ctx.drawImage(cutCanvas, bbox.x, bbox.y, bbox.w, bbox.h, drawX, drawY, drawW, drawH);

      setResult(out.toDataURL("image/jpeg", 0.92));
    } catch (err: unknown) {
      console.error(err);
      toast.error(getErrorMessage(err, "Freistellen fehlgeschlagen"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const res = await fetch(result);
      const blob = await res.blob();
      const path = `motorhomes/${motorhomeId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("vehicle-images")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("vehicle-images").getPublicUrl(path);

      const { count } = await supabase
        .from("motorhome_images")
        .select("id", { count: "exact", head: true })
        .eq("motorhome_id", motorhomeId);

      const { error: insErr } = await supabase.from("motorhome_images").insert({
        motorhome_id: motorhomeId,
        url: pub.publicUrl,
        storage_path: path,
        position: count ?? 0,
      });
      if (insErr) throw insErr;
      toast.success("Foto gespeichert");
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Speichern fehlgeschlagen"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" /> Fahrzeug freistellen & Hintergrund setzen
        </DialogTitle>
        <p className="text-xs text-muted-foreground -mt-1">
          Das Fahrzeug wird pixelgenau ausgeschnitten — gleicher Winkel, gleiche Form, keine
          KI-Neuzeichnung.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">Original</div>
            <div className="aspect-video bg-muted rounded-md overflow-hidden border">
              <img src={imageUrl} alt="" className="w-full h-full object-contain" />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">Ergebnis</div>
            <div className="aspect-video bg-muted rounded-md overflow-hidden border grid place-items-center">
              {busy ? (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Fahrzeug wird freigestellt…
                </div>
              ) : result ? (
                <img src={result} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="text-xs text-muted-foreground p-4 text-center">
                  Stil wählen und „Generieren" klicken.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Hintergrund-Stil</Label>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STYLES.map((s) => {
                const Icon = s.icon;
                const disabled = s.id === "company" && !backgroundUrl;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => setStyle(s.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-md border p-2.5 text-left transition",
                      style === s.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:border-foreground/30",
                      disabled && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <div className="text-sm font-medium">{s.label}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight">
                      {disabled ? "Kein Firmenbild" : s.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground">
              Fahrzeug-Größe im Bild: {scale}%
            </Label>
            <Slider
              min={50}
              max={100}
              step={5}
              value={[scale]}
              onValueChange={(v) => setScale(v[0])}
              disabled={busy}
              className="mt-2"
            />
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground">
              Hintergrund-Helligkeit: {brightness > 0 ? "+" : ""}
              {brightness}%
            </Label>
            <Slider
              min={-20}
              max={40}
              step={5}
              value={[brightness]}
              onValueChange={(v) => setBrightness(v[0])}
              disabled={busy}
              className="mt-2"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy || saving}>
            <X className="h-4 w-4 mr-1" /> Abbrechen
          </Button>
          <Button
            variant="outline"
            onClick={generate}
            disabled={busy || saving || (style === "company" && !backgroundUrl)}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            {result ? "Neu generieren" : "Generieren"}
          </Button>
          <Button onClick={save} disabled={!result || busy || saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            Als neues Foto speichern
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
