import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, Download, Save, RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2,
  Sparkles, Eraser, Brush, Wand2, Square, X, Maximize2, Minimize2,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  type Adjustments, NEUTRAL, PRESETS, mergePreset, isNeutral,
  renderToCanvas, canvasToJpegBlob, loadImage, downloadBlob,
} from "@/lib/image-filters";
import { MaskCanvas, type MaskHandle } from "./photo-editor/MaskCanvas";

type Props = {
  imageUrl: string;
  storagePath: string;
  filename?: string;
  onSaved?: (info?: { adjustments: Adjustments }) => void;
  onClose: () => void;
  /** Total number of photos for prev/next navigation. */
  total?: number;
  /** 0-based index of the currently edited photo. */
  index?: number;
  /** Called when user wants to switch photos (prev/next). */
  onNavigate?: (newIndex: number) => void;
};

const ASPECTS: Array<{ label: string; v: number | undefined }> = [
  { label: "Frei", v: undefined },
  { label: "16:9", v: 16 / 9 },
  { label: "4:3", v: 4 / 3 },
  { label: "3:2", v: 3 / 2 },
  { label: "1:1", v: 1 },
];

export function PhotoEditor({ imageUrl, storagePath, filename, onSaved, onClose, total, index, onNavigate }: Props) {
  // Source image (immutable original loaded from URL)
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  // Working image (after crop/rotate baked in)
  const [workingImg, setWorkingImg] = useState<HTMLImageElement | null>(null);
  const [adj, setAdj] = useState<Adjustments>(NEUTRAL);
  const [tab, setTab] = useState<"adjust" | "crop" | "filter" | "ai">("adjust");
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // Crop state
  const [crop, setCrop] = useState<Crop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [rotation, setRotation] = useState(0); // 0 / 90 / 180 / 270
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const cropImgRef = useRef<HTMLImageElement>(null);

  // AI mask
  const maskRef = useRef<MaskHandle>(null);
  const [brushSize, setBrushSize] = useState(40);
  const [brushMode, setBrushMode] = useState<"paint" | "erase">("paint");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  // Loading the source
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setAdj(NEUTRAL);
    setCrop(undefined);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    const url = imageUrl.startsWith("http") ? `${imageUrl}?cb=${Date.now()}` : imageUrl;
    loadImage(url)
      .then((img) => {
        if (cancelled) return;
        setSourceImg(img);
        setWorkingImg(img);
        setBusy(false);
      })
      .catch(() => { if (!cancelled) { toast.error("Bild konnte nicht geladen werden"); setBusy(false); } });
    return () => { cancelled = true; };
  }, [imageUrl]);

  // Render preview whenever working image / adjustments / showOriginal change
  useEffect(() => {
    if (!workingImg || !previewRef.current) return;
    renderToCanvas(showOriginal ? sourceImg! : workingImg, previewRef.current, showOriginal ? NEUTRAL : adj, 1400);
  }, [workingImg, sourceImg, adj, showOriginal]);

  // Bake crop/rotate/flip into a new working image
  const applyCrop = async () => {
    if (!sourceImg) return;
    const c = crop;
    const w = sourceImg.naturalWidth, h = sourceImg.naturalHeight;
    const tmp = document.createElement("canvas");
    // Determine output size considering rotation
    const isSide = rotation === 90 || rotation === 270;

    // First: render rotation+flip into a canvas at full source size
    const r1 = document.createElement("canvas");
    r1.width = isSide ? h : w;
    r1.height = isSide ? w : h;
    const c1 = r1.getContext("2d")!;
    c1.translate(r1.width / 2, r1.height / 2);
    c1.rotate((rotation * Math.PI) / 180);
    c1.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    c1.drawImage(sourceImg, -w / 2, -h / 2);

    // Then crop (% of r1)
    let sx = 0, sy = 0, sw = r1.width, sh = r1.height;
    if (c && c.width && c.height) {
      sx = (c.x / 100) * r1.width;
      sy = (c.y / 100) * r1.height;
      sw = (c.width / 100) * r1.width;
      sh = (c.height / 100) * r1.height;
    }
    tmp.width = Math.round(sw); tmp.height = Math.round(sh);
    const ctx = tmp.getContext("2d")!;
    ctx.drawImage(r1, sx, sy, sw, sh, 0, 0, sw, sh);

    // Use a lossless PNG intermediate so the crop step doesn't degrade quality.
    const blob: Blob = await new Promise((resolve, reject) =>
      tmp.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
    );
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setWorkingImg(img);
    setCrop(undefined);
    setRotation(0); setFlipH(false); setFlipV(false);
    setTab("adjust");
    toast.success("Zuschnitt übernommen");
  };

  const onCropImgLoad = () => {
    if (!aspect || !cropImgRef.current) return;
    const { width, height } = cropImgRef.current;
    const c = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspect, width, height), width, height);
    setCrop(c);
  };

  const reset = () => {
    setAdj(NEUTRAL); setRotation(0); setFlipH(false); setFlipV(false); setCrop(undefined);
    if (sourceImg) setWorkingImg(sourceImg);
  };

  // AI inpaint / operations
  const runAi = async (op: "inpaint" | "auto_enhance" | "remove_background" | "blur_plate", prompt?: string) => {
    if (!workingImg || !previewRef.current) return;
    setAiBusy(true);
    try {
      // Bake adjustments at FULL resolution so the AI receives a high-quality source
      const fullCanvas = document.createElement("canvas");
      renderToCanvas(workingImg, fullCanvas, adj);
      const fullBlob = await canvasToJpegBlob(fullCanvas, 0.98);
      const imageBase64 = await blobToDataUrl(fullBlob);
      let maskBase64: string | undefined;
      if (op === "inpaint") {
        // Mask is painted over the preview — export it at full resolution
        const m = maskRef.current?.exportMask(fullCanvas.width, fullCanvas.height);
        if (!m) { toast.error("Bitte zuerst die Stelle mit dem Pinsel markieren"); setAiBusy(false); return; }
        maskBase64 = m;
      }
      const { data, error } = await supabase.functions.invoke("edit-vehicle-image", {
        body: { imageBase64, maskBase64, operation: op, prompt },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const newImg = await loadImage(data.imageBase64);
      setWorkingImg(newImg);
      setAdj(NEUTRAL);
      maskRef.current?.clear();
      toast.success("KI-Bearbeitung übernommen");
    } catch (err: any) {
      toast.error(err.message ?? "KI-Bearbeitung fehlgeschlagen");
    } finally {
      setAiBusy(false);
    }
  };

  const exportFinalCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement("canvas");
    if (!workingImg) throw new Error("no image");
    renderToCanvas(workingImg, canvas, adj);
    return canvas;
  };

  const handleDownload = async () => {
    try {
      const c = await exportFinalCanvas();
      const blob = await canvasToJpegBlob(c, 0.98);
      downloadBlob(blob, filename || "fahrzeugbild.jpg");
    } catch (e: any) {
      toast.error(e.message ?? "Download fehlgeschlagen");
    }
  };

  const handleSave = async () => {
    // Skip re-encoding (and the quality loss that comes with it) when nothing changed
    if (workingImg === sourceImg && isNeutral(adj)) {
      toast.success("Keine Änderungen — nichts zu speichern");
      onClose();
      return;
    }
    setBusy(true);
    try {
      const c = await exportFinalCanvas();
      const blob = await canvasToJpegBlob(c, 0.98);
      const file = new File([blob], "edited.jpg", { type: "image/jpeg" });
      const { error: upErr } = await supabase.storage
        .from("vehicle-images")
        .upload(storagePath, file, { upsert: true, contentType: "image/jpeg", cacheControl: "0" });
      if (upErr) throw upErr;
      toast.success("Bild gespeichert");
      onSaved?.({ adjustments: adj });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  const sliderRow = (key: keyof Adjustments, label: string, min = -100, max = 100) => (
    <div key={key} className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{adj[key]}</span>
      </div>
      <Slider
        min={min} max={max} step={1} value={[adj[key]]}
        onValueChange={(v) => setAdj((a) => ({ ...a, [key]: v[0] }))}
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className={
          fullscreen
            ? "max-w-none w-screen h-screen p-0 gap-0 flex flex-col rounded-none border-0 sm:rounded-none"
            : "max-w-[1200px] w-[95vw] h-[90vh] p-0 gap-0 flex flex-col"
        }
      >
        <DialogTitle className="sr-only">Foto-Editor</DialogTitle>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Foto-Editor</span>
            {typeof total === "number" && typeof index === "number" && total > 1 && (
              <div className="ml-3 flex items-center gap-1">
                <Button
                  variant="ghost" size="sm"
                  disabled={busy || aiBusy || index <= 0}
                  onClick={() => onNavigate?.(index - 1)}
                  title="Vorheriges Foto"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground min-w-[3rem] text-center">
                  {index + 1} / {total}
                </span>
                <Button
                  variant="ghost" size="sm"
                  disabled={busy || aiBusy || index >= total - 1}
                  onClick={() => onNavigate?.(index + 1)}
                  title="Nächstes Foto"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset} disabled={busy || aiBusy}>
              Zurücksetzen
            </Button>
            <Button
              variant="ghost" size="sm"
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onMouseLeave={() => setShowOriginal(false)}
            >
              Vorher (halten)
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFullscreen((f) => !f)}
              title={fullscreen ? "Vollbild verlassen" : "Vollbild"}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              {fullscreen ? "Verlassen" : "Vollbild"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} disabled={busy || aiBusy}>
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button size="sm" onClick={handleSave} disabled={busy || aiBusy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Speichern
            </Button>
          </div>
        </div>

        {/* Body */}
        <div
          className={
            fullscreen
              ? "flex-1 min-h-0"
              : "flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr] min-h-0"
          }
        >
          {/* Panel */}
          {!fullscreen && (
          <div className="border-r bg-background overflow-y-auto lg:order-first">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList className="grid grid-cols-4 w-full rounded-none border-b bg-transparent h-11">
                <TabsTrigger value="adjust">Anpassen</TabsTrigger>
                <TabsTrigger value="crop">Zuschnitt</TabsTrigger>
                <TabsTrigger value="filter">Filter</TabsTrigger>
                <TabsTrigger value="ai">KI</TabsTrigger>
              </TabsList>

              <TabsContent value="adjust" className="p-4 space-y-4 mt-0">
                <Section title="Belichtung">
                  {sliderRow("exposure", "Belichtung")}
                  {sliderRow("brightness", "Helligkeit")}
                  {sliderRow("contrast", "Kontrast")}
                  {sliderRow("highlights", "Lichter")}
                  {sliderRow("shadows", "Schatten")}
                </Section>
                <Section title="Farbe">
                  {sliderRow("temperature", "Temperatur")}
                  {sliderRow("tint", "Tönung")}
                  {sliderRow("saturation", "Sättigung")}
                  {sliderRow("vibrance", "Lebendigkeit")}
                </Section>
                <Section title="Details">
                  {sliderRow("clarity", "Klarheit", 0, 100)}
                  {sliderRow("sharpness", "Schärfe", 0, 100)}
                  {sliderRow("vignette", "Vignette", 0, 100)}
                </Section>
              </TabsContent>

              <TabsContent value="crop" className="p-4 space-y-4 mt-0">
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Seitenverhältnis</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ASPECTS.map((a) => (
                      <Button key={a.label} variant={aspect === a.v ? "default" : "outline"} size="sm"
                        onClick={() => { setAspect(a.v); setCrop(undefined); setTimeout(onCropImgLoad, 0); }}>
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide mb-2 block">Drehen / Spiegeln</Label>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setRotation((r) => (r + 270) % 360)}><RotateCcw className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => setRotation((r) => (r + 90) % 360)}><RotateCw className="h-4 w-4" /></Button>
                    <Button variant={flipH ? "default" : "outline"} size="sm" onClick={() => setFlipH((v) => !v)}><FlipHorizontal2 className="h-4 w-4" /></Button>
                    <Button variant={flipV ? "default" : "outline"} size="sm" onClick={() => setFlipV((v) => !v)}><FlipVertical2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Button className="w-full" onClick={applyCrop}>
                  <Square className="h-4 w-4" /> Zuschnitt übernehmen
                </Button>
                <p className="text-xs text-muted-foreground">
                  Zieh einen Rahmen ins Bild oder wähle ein Verhältnis. Übernehmen brennt den Crop ins Bild.
                </p>
              </TabsContent>

              <TabsContent value="filter" className="p-4 mt-0">
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => setAdj(mergePreset(NEUTRAL, p.adj))}
                      className="border rounded-md p-2.5 text-left hover:bg-accent transition text-sm"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Filter wendet voreingestellte Slider an — danach im Tab „Anpassen" feinjustierbar.
                </p>
              </TabsContent>

              <TabsContent value="ai" className="p-4 space-y-4 mt-0">
                <div className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Brush className="h-4 w-4" /> KI-Pinsel (Inpaint)
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant={brushMode === "paint" ? "default" : "outline"} size="sm"
                      onClick={() => setBrushMode("paint")}><Brush className="h-4 w-4" /> Malen</Button>
                    <Button variant={brushMode === "erase" ? "default" : "outline"} size="sm"
                      onClick={() => setBrushMode("erase")}><Eraser className="h-4 w-4" /> Radieren</Button>
                    <Button variant="ghost" size="sm" onClick={() => maskRef.current?.clear()}>Maske leeren</Button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Pinselgröße</span>
                      <span className="tabular-nums">{brushSize}px</span>
                    </div>
                    <Slider min={5} max={150} step={1} value={[brushSize]} onValueChange={(v) => setBrushSize(v[0])} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Anweisung (optional)</Label>
                    <Input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="z.B. „durch sauberen Asphalt ersetzen“" />
                  </div>
                  <Button className="w-full" disabled={aiBusy} onClick={() => runAi("inpaint", aiPrompt || undefined)}>
                    {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    Markierten Bereich bearbeiten
                  </Button>
                </div>

                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">Schnellaktionen</div>
                  <Button variant="outline" className="w-full justify-start" disabled={aiBusy} onClick={() => runAi("auto_enhance")}>
                    <Sparkles className="h-4 w-4" /> Auto-Verbessern
                  </Button>
                  <Button variant="outline" className="w-full justify-start" disabled={aiBusy} onClick={() => runAi("blur_plate")}>
                    <Square className="h-4 w-4" /> Kennzeichen unkenntlich machen
                  </Button>
                  <Button variant="outline" className="w-full justify-start" disabled={aiBusy} onClick={() => runAi("remove_background")}>
                    <Square className="h-4 w-4" /> Hintergrund auf Studio
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tipp: Erst KI anwenden — die KI sieht das Bild inkl. deiner aktuellen Anpassungen, alle Slider werden danach zurückgesetzt.
                </p>
              </TabsContent>
            </Tabs>
          </div>
          )}

          {/* Stage */}
          <div className="bg-muted/30 grid place-items-center p-4 overflow-auto relative">
            {!workingImg && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}

            {workingImg && tab !== "crop" && tab !== "ai" && (
              <canvas ref={previewRef} className="max-w-full max-h-full object-contain shadow-md rounded" />
            )}

            {workingImg && tab === "crop" && (
              <ReactCrop crop={crop} aspect={aspect} onChange={(_, p) => setCrop(p)}>
                <img
                  ref={cropImgRef}
                  src={workingImg.src}
                  onLoad={onCropImgLoad}
                  alt=""
                  style={{
                    transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                    maxHeight: "70vh",
                  }}
                  crossOrigin="anonymous"
                />
              </ReactCrop>
            )}

            {workingImg && tab === "ai" && (
              <div className="relative w-full h-full grid place-items-center">
                <canvas ref={previewRef} className="hidden" />
                <MaskCanvas
                  ref={maskRef}
                  imageUrl={workingImg.src}
                  brushSize={brushSize}
                  mode={brushMode}
                />
                {aiBusy && (
                  <div className="absolute inset-0 grid place-items-center bg-background/70 rounded">
                    <div className="flex flex-col items-center gap-2 text-sm">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      KI arbeitet… (5–20 Sek.)
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
