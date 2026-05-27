import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Sparkles, Camera, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SuggestedPosition {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceSuggestion {
  title?: string;
  summary?: string;
  notes?: string;
  positions: SuggestedPosition[];
}

interface Props {
  docType: string;
  vehicle?: Record<string, unknown>;
  onSuggested: (s: InvoiceSuggestion) => void;
}

import { heicFileToJpeg, isHeicFile } from "@/lib/heic";

async function fileToCompressedDataUrl(input: File, maxSide = 1600): Promise<string> {
  const file = isHeicFile(input) ? await heicFileToJpeg(input, 0.9) : input;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function AiInvoiceAssistant({ docType, vehicle, onSuggested }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGES = 4;

  const reset = () => { setDescription(""); setImages([]); };

  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files).slice(0, MAX_IMAGES - images.length);
    const out: string[] = [];
    for (const f of arr) {
      try { out.push(await fileToCompressedDataUrl(f)); }
      catch { toast.error(`Bild konnte nicht gelesen werden: ${f.name}`); }
    }
    setImages((p) => [...p, ...out].slice(0, MAX_IMAGES));
  };

  const run = async () => {
    if (!description.trim() && images.length === 0) {
      toast.error("Bitte Beschreibung eingeben oder Bilder hinzufügen.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-invoice-positions", {
        body: { description, images, docType, vehicle },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const s = (data as any)?.data as InvoiceSuggestion;
      if (!s?.positions?.length) throw new Error("Keine Positionen vom KI-Modell erhalten.");
      onSuggested(s);
      toast.success("Vorschlag übernommen");
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "KI-Vorschlag fehlgeschlagen");
    } finally { setBusy(false); }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          KI-Vorschlag
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 space-y-3">
        <div>
          <div className="text-sm font-medium">KI-Vorschlag für Positionen</div>
          <div className="text-xs text-muted-foreground">
            Beschreibe den Auftrag/Schaden und/oder lade Fotos hoch. Die KI schlägt Positionen vor.
          </div>
        </div>

        <Textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={`z.B. "Kratzer ca. 30cm an Seitenwand links, lackieren und polieren"`}
        />

        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative rounded border bg-muted/30 overflow-hidden aspect-square">
                <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5 hover:bg-background"
                  aria-label="Entfernen"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input ref={camRef} type="file" accept="image/*,.heic,.heif" capture="environment" className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => camRef.current?.click()} disabled={busy || images.length >= MAX_IMAGES}>
            <Camera className="h-3.5 w-3.5 mr-1" /> Foto
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy || images.length >= MAX_IMAGES}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Bilder
          </Button>
        </div>

        <Button type="button" className="w-full" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
          Vorschlag erzeugen
        </Button>
      </PopoverContent>
    </Popover>
  );
}
