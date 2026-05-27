import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FUEL_LABELS, TRANSMISSION_LABELS, STATUS_LABELS, type FuelType, type TransmissionType, type VehicleStatus } from "@/lib/vehicles";
import { toast } from "sonner";
import { Loader2, Upload, X, Star, StarOff, FileText, Sparkles } from "lucide-react";

interface VehicleData {
  id?: string;
  brand: string;
  model: string;
  year: string;
  first_registration: string;
  mileage: string;
  price: string;
  purchase_price: string;
  vin: string;
  color: string;
  fuel: FuelType | "";
  transmission: TransmissionType | "";
  power_hp: string;
  power_kw: string;
  displacement_cc: string;
  doors: string;
  seats: string;
  features: string;
  notes: string;
  status: VehicleStatus;
  main_image_url: string | null;
}

interface ImageItem { id?: string; url: string; storage_path: string; }

const empty: VehicleData = {
  brand: "", model: "", year: "", first_registration: "", mileage: "", price: "", purchase_price: "",
  vin: "", color: "", fuel: "", transmission: "", power_hp: "", power_kw: "",
  displacement_cc: "", doors: "", seats: "", features: "", notes: "",
  status: "verfuegbar", main_image_url: null,
};

export function VehicleForm({ vehicleId }: { vehicleId?: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<VehicleData>(empty);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(!!vehicleId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!vehicleId) return;
    (async () => {
      const { data: v } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
      if (v) {
        setData({
          ...empty,
          ...v,
          year: v.year?.toString() ?? "",
          mileage: v.mileage?.toString() ?? "",
          price: v.price?.toString() ?? "",
          purchase_price: (v as any).purchase_price?.toString() ?? "",
          power_hp: v.power_hp?.toString() ?? "",
          power_kw: v.power_kw?.toString() ?? "",
          displacement_cc: v.displacement_cc?.toString() ?? "",
          doors: v.doors?.toString() ?? "",
          seats: v.seats?.toString() ?? "",
          first_registration: v.first_registration ?? "",
          features: (v.features ?? []).join("\n"),
          fuel: (v.fuel ?? "") as FuelType | "",
          transmission: (v.transmission ?? "") as TransmissionType | "",
          notes: v.notes ?? "",
          vin: v.vin ?? "",
          color: v.color ?? "",
        });
      }
      const { data: imgs } = await supabase.from("vehicle_images").select("*").eq("vehicle_id", vehicleId).order("position");
      setImages((imgs ?? []).map(i => ({ id: i.id, url: i.url, storage_path: i.storage_path })));
      setLoading(false);
    })();
  }, [vehicleId]);

  const set = <K extends keyof VehicleData>(k: K, v: VehicleData[K]) => setData(d => ({ ...d, [k]: v }));

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newImgs: ImageItem[] = [];
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("vehicle-images").upload(path, file);
        if (error) throw error;
        const { data: pub } = supabase.storage.from("vehicle-images").getPublicUrl(path);
        newImgs.push({ url: pub.publicUrl, storage_path: path });
      }
      setImages(prev => [...prev, ...newImgs]);
      if (!data.main_image_url && newImgs[0]) set("main_image_url", newImgs[0].url);
    } catch (err: any) {
      toast.error(err.message ?? "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (img: ImageItem) => {
    setImages(prev => prev.filter(i => i.url !== img.url));
    if (data.main_image_url === img.url) set("main_image_url", null);
    await supabase.storage.from("vehicle-images").remove([img.storage_path]);
    if (img.id) await supabase.from("vehicle_images").delete().eq("id", img.id);
  };

  const extractFromPdf = async (file: File) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Bitte eine PDF-Datei auswählen");
      return;
    }
    setExtracting(true);
    try {
      // Rasterize PDF to compressed JPEGs client-side. Keeps payload well under
      // the AI provider's 30MB-per-image limit and avoids edge function memory issues.
      const { rasterizePdfToJpegs } = await import("@/lib/pdf-rasterize");
      const images = await rasterizePdfToJpegs(file, { maxPages: 4, scale: 1.5, quality: 0.7 });

      const { data: result, error } = await supabase.functions.invoke("extract-vehicle-pdf", {
        body: { images },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      const ex = result?.data ?? {};
      setData(d => ({
        ...d,
        brand: ex.brand ?? d.brand,
        model: ex.model ?? d.model,
        year: ex.year != null ? String(ex.year) : d.year,
        first_registration: ex.first_registration ?? d.first_registration,
        mileage: ex.mileage != null ? String(ex.mileage) : d.mileage,
        price: ex.price != null ? String(ex.price) : d.price,
        vin: ex.vin ?? d.vin,
        color: ex.color ?? d.color,
        fuel: (ex.fuel as FuelType) ?? d.fuel,
        transmission: (ex.transmission as TransmissionType) ?? d.transmission,
        power_hp: ex.power_hp != null ? String(ex.power_hp) : d.power_hp,
        power_kw: ex.power_kw != null ? String(ex.power_kw) : d.power_kw,
        displacement_cc: ex.displacement_cc != null ? String(ex.displacement_cc) : d.displacement_cc,
        doors: ex.doors != null ? String(ex.doors) : d.doors,
        seats: ex.seats != null ? String(ex.seats) : d.seats,
        features: Array.isArray(ex.features) && ex.features.length
          ? ex.features.filter((f: string) => !/halter|vorbesitz|\d\.\s*hand/i.test(f)).join("\n")
          : d.features,
        // notes (interne Notizen) bewusst NICHT aus PDF übernehmen
      }));
      toast.success("Daten aus PDF übernommen — bitte prüfen");
    } catch (err: any) {
      toast.error(err.message ?? "PDF konnte nicht gelesen werden");
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    if (!data.brand || !data.model) { toast.error("Marke und Modell sind erforderlich"); return; }
    setSaving(true);
    try {
      const payload: any = {
        brand: data.brand, model: data.model,
        year: data.year ? parseInt(data.year) : null,
        first_registration: data.first_registration || null,
        mileage: data.mileage ? parseInt(data.mileage) : null,
        price: data.price ? parseFloat(data.price) : null,
        purchase_price: data.purchase_price ? parseFloat(data.purchase_price) : null,
        vin: data.vin || null, color: data.color || null,
        fuel: data.fuel || null, transmission: data.transmission || null,
        power_hp: data.power_hp ? parseInt(data.power_hp) : null,
        power_kw: data.power_kw ? parseInt(data.power_kw) : null,
        displacement_cc: data.displacement_cc ? parseInt(data.displacement_cc) : null,
        doors: data.doors ? parseInt(data.doors) : null,
        seats: data.seats ? parseInt(data.seats) : null,
        features: data.features.split("\n").map(s => s.trim()).filter(Boolean),
        notes: data.notes || null, status: data.status,
        main_image_url: data.main_image_url,
      };

      let id = vehicleId;
      if (vehicleId) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", vehicleId);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id;
        const { data: inserted, error } = await supabase.from("vehicles").insert(payload).select().single();
        if (error) throw error;
        id = inserted.id;
      }

      // Sync images: insert any without id
      const newImgs = images.filter(i => !i.id);
      if (newImgs.length > 0 && id) {
        await supabase.from("vehicle_images").insert(
          newImgs.map((i, idx) => ({ vehicle_id: id, url: i.url, storage_path: i.storage_path, position: images.indexOf(i) + idx }))
        );
      }

      toast.success(vehicleId ? "Fahrzeug aktualisiert" : "Fahrzeug angelegt");
      navigate({ to: "/fahrzeuge/$id", params: { id: id! } });
    } catch (err: any) {
      toast.error(err.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{vehicleId ? "Fahrzeug bearbeiten" : "Neues Fahrzeug"}</h1>
      </div>

      {!vehicleId && (
        <Card
          className={`p-6 border-2 border-dashed transition ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) extractFromPdf(f);
          }}
        >
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-md bg-primary/10 grid place-items-center text-primary">
              {extracting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">PDF hierher ziehen, um Fahrzeugdaten automatisch auszufüllen</p>
              <p className="text-xs text-muted-foreground">Fahrzeugschein, Inserat oder Datenblatt — Felder werden vorausgefüllt und können geprüft werden.</p>
            </div>
            <label>
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) extractFromPdf(f); e.target.value = ""; }} />
              <Button type="button" variant="outline" disabled={extracting} asChild>
                <span><FileText className="h-4 w-4" /> PDF auswählen</span>
              </Button>
            </label>
          </div>
        </Card>
      )}


      <Card className="p-6">
        <h2 className="font-semibold mb-4">Basis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Marke *"><Input value={data.brand} onChange={e => set("brand", e.target.value)} /></Field>
          <Field label="Modell *"><Input value={data.model} onChange={e => set("model", e.target.value)} /></Field>
          <Field label="Baujahr"><Input type="number" value={data.year} onChange={e => set("year", e.target.value)} /></Field>
          <Field label="Erstzulassung"><Input type="date" value={data.first_registration} onChange={e => set("first_registration", e.target.value)} /></Field>
          <Field label="Kilometerstand"><Input type="number" value={data.mileage} onChange={e => set("mileage", e.target.value)} /></Field>
          <Field label="Verkaufspreis VK (€)"><Input type="number" step="0.01" value={data.price} onChange={e => set("price", e.target.value)} /></Field>
          <Field label="Einkaufspreis EK (€)"><Input type="number" step="0.01" value={data.purchase_price} onChange={e => set("purchase_price", e.target.value)} /></Field>
          <Field label="Status">
            <Select value={data.status} onValueChange={v => set("status", v as VehicleStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Technische Daten</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="VIN"><Input value={data.vin} onChange={e => set("vin", e.target.value)} /></Field>
          <Field label="Farbe"><Input value={data.color} onChange={e => set("color", e.target.value)} /></Field>
          <Field label="Kraftstoff">
            <Select value={data.fuel} onValueChange={v => set("fuel", v as FuelType)}>
              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(FUEL_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Getriebe">
            <Select value={data.transmission} onValueChange={v => set("transmission", v as TransmissionType)}>
              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRANSMISSION_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Leistung (PS)"><Input type="number" value={data.power_hp} onChange={e => set("power_hp", e.target.value)} /></Field>
          <Field label="Leistung (kW)"><Input type="number" value={data.power_kw} onChange={e => set("power_kw", e.target.value)} /></Field>
          <Field label="Hubraum (cm³)"><Input type="number" value={data.displacement_cc} onChange={e => set("displacement_cc", e.target.value)} /></Field>
          <Field label="Türen"><Input type="number" value={data.doors} onChange={e => set("doors", e.target.value)} /></Field>
          <Field label="Sitze"><Input type="number" value={data.seats} onChange={e => set("seats", e.target.value)} /></Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Ausstattung & Notizen</h2>
        <Field label="Ausstattung (eine pro Zeile)">
          <Textarea rows={6} value={data.features} onChange={e => set("features", e.target.value)} placeholder="Klimaautomatik&#10;Navigationssystem&#10;Sitzheizung" />
        </Field>
        <div className="mt-4">
          <Field label="Interne Notizen">
            <Textarea rows={3} value={data.notes} onChange={e => set("notes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>Abbrechen</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Speichert…" : "Speichern"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}
