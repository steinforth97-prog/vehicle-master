import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, ScanLine, Camera, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ScanMode = "id" | "zb1" | "booking";

export interface IdData {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  id_number?: string;
  street?: string;
  zip?: string;
  city?: string;
  address?: string;
}

export interface Zb1Data {
  brand?: string;
  model?: string;
  vin?: string;
  license_plate?: string;
  first_registration?: string;
  color?: string;
  fuel?: string;
  power_kw?: number;
  displacement_cc?: number;
  owner_name?: string;
  owner_street?: string;
  owner_zip?: string;
  owner_city?: string;
  owner_address?: string;
}

export interface BookingData {
  customer_name?: string;
  customer_street?: string;
  customer_zip?: string;
  customer_city?: string;
  customer_address?: string;
  customer_email?: string;
  customer_phone?: string;
  booking_number?: string;
  rental_start?: string;
  rental_end?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  vehicle_license_plate?: string;
  vehicle_vin?: string;
  mileage_out?: number;
  mileage_in?: number;
  damage_description?: string;
  additional_notes?: string;
}

interface Props {
  mode: ScanMode;
  label?: string;
  onIdScanned?: (data: IdData) => void;
  onZb1Scanned?: (data: Zb1Data) => void;
  onBookingScanned?: (data: BookingData) => void;
}

import { heicFileToJpeg, isHeicFile } from "@/lib/heic";

async function fileToCompressedDataUrl(input: File, maxSide = 1800): Promise<string> {
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
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function DocumentScanner({ mode, label, onIdScanned, onZb1Scanned, onBookingScanned }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const maxImages = mode === "booking" ? 6 : 2;
  const reset = () => { setPreviews([]); };

  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files).slice(0, maxImages - previews.length);
    const dataUrls: string[] = [];
    for (const f of arr) {
      try { dataUrls.push(await fileToCompressedDataUrl(f)); }
      catch { toast.error(`Bild konnte nicht gelesen werden: ${f.name}`); }
    }
    setPreviews((p) => [...p, ...dataUrls].slice(0, maxImages));
  };

  const removeAt = (i: number) => setPreviews((p) => p.filter((_, idx) => idx !== i));

  const runScan = async () => {
    if (previews.length === 0) { toast.error("Bitte mindestens ein Bild auswählen."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-document", {
        body: { mode, images: previews },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const result = (data as any)?.data ?? {};
      if (mode === "id") onIdScanned?.(result as IdData);
      else if (mode === "zb1") onZb1Scanned?.(result as Zb1Data);
      else onBookingScanned?.(result as BookingData);
      toast.success("Daten übernommen");
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Scan fehlgeschlagen");
    } finally { setBusy(false); }
  };

  const title = label ?? (
    mode === "id" ? "Ausweis scannen"
    : mode === "zb1" ? "Fahrzeugschein scannen"
    : "Buchungsunterlagen scannen"
  );
  const hint = mode === "id"
    ? "Vorder- und Rückseite (max. 2 Bilder)"
    : mode === "zb1"
    ? "Vorder- und Rückseite des Fahrzeugscheins (max. 2 Bilder)"
    : "Buchung, Mietvertrag, Übergabe-/Rückgabeprotokoll (max. 6 Seiten)";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <ScanLine className="h-3.5 w-3.5" />
          {title}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative rounded border bg-muted/30 overflow-hidden aspect-[3/2]">
              <img src={src} alt={`Scan ${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5 hover:bg-background"
                aria-label="Entfernen"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {previews.length < maxImages && (
            <div className="rounded border border-dashed flex items-center justify-center aspect-[3/2] text-xs text-muted-foreground">
              Seite {previews.length + 1}
            </div>
          )}
        </div>

        <input
          ref={camRef}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="hidden"
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => camRef.current?.click()} disabled={busy || previews.length >= maxImages}>
            <Camera className="h-3.5 w-3.5 mr-1" /> Foto
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy || previews.length >= maxImages}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Datei
          </Button>
        </div>

        <Button type="button" className="w-full" onClick={runScan} disabled={busy || previews.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ScanLine className="h-4 w-4 mr-1" />}
          Scannen & übernehmen
        </Button>
      </PopoverContent>
    </Popover>
  );
}
