import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FUEL_LABELS, TRANSMISSION_LABELS, STATUS_LABELS, type FuelType, type TransmissionType, type VehicleStatus } from "@/lib/vehicles";
import { BODY_TYPE_LABELS, type MotorhomeBodyType } from "@/lib/motorhomes";
import { toast } from "sonner";
import { FileText, IdCard, Loader2 } from "lucide-react";

type ExtractMode = "inserat" | "fahrzeugschein";

export function MotorhomeForm({ motorhomeId }: { motorhomeId?: string }) {
  const navigate = useNavigate();
  const [d, setD] = useState<any>({ status: "verfuegbar", features: "" });
  const [loading, setLoading] = useState(!!motorhomeId);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState<ExtractMode | null>(null);
  const inseratInputRef = useRef<HTMLInputElement>(null);
  const scheinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!motorhomeId) return;
    (async () => {
      const { data } = await supabase.from("motorhomes").select("*").eq("id", motorhomeId).single();
      if (data) {
        setD({
          ...data,
          year: data.year?.toString() ?? "",
          mileage: data.mileage?.toString() ?? "",
          price: data.price?.toString() ?? "",
          purchase_price: data.purchase_price?.toString() ?? "",
          sale_price: (data as any).sale_price?.toString() ?? "",
          power_hp: data.power_hp?.toString() ?? "",
          power_kw: data.power_kw?.toString() ?? "",
          displacement_cc: data.displacement_cc?.toString() ?? "",
          sleeping_places: data.sleeping_places?.toString() ?? "",
          sitting_places: data.sitting_places?.toString() ?? "",
          length_mm: data.length_mm?.toString() ?? "",
          width_mm: data.width_mm?.toString() ?? "",
          height_mm: data.height_mm?.toString() ?? "",
          gross_weight_kg: data.gross_weight_kg?.toString() ?? "",
          first_registration: data.first_registration ?? "",
          features: (data.features ?? []).join("\n"),
          fuel: data.fuel ?? "",
          transmission: data.transmission ?? "",
          body_type: data.body_type ?? "",
          notes: data.notes ?? "",
          vin: data.vin ?? "",
          color: data.color ?? "",
          brand: data.brand ?? "",
          model: data.model ?? "",
          license_plate: (data as any).license_plate ?? "",
        });
      }
      setLoading(false);
    })();
  }, [motorhomeId]);

  const set = (k: string, v: any) => setD((p: any) => ({ ...p, [k]: v }));

  const num = (s: string, parser: (x: string) => number) => s ? parser(s) : null;

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  const extractFromFile = async (file: File, mode: ExtractMode) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      toast.error("Bitte PDF oder Bild auswählen");
      return;
    }
    setExtracting(mode);
    try {
      let images: string[];
      if (isPdf) {
        const { rasterizePdfToJpegs } = await import("@/lib/pdf-rasterize");
        images = await rasterizePdfToJpegs(file, { maxPages: 4, scale: 1.5, quality: 0.7 });
      } else {
        images = [await fileToDataUrl(file)];
      }

      const { data: result, error } = await supabase.functions.invoke("extract-motorhome-pdf", {
        body: { mode, images },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      const ex = result?.data ?? {};

      // Only fill EMPTY fields — never overwrite existing input
      const merge = (key: string, val: any) => {
        if (val == null || val === "") return;
        setD((prev: any) => {
          const cur = prev[key];
          if (cur != null && cur !== "") return prev;
          return { ...prev, [key]: typeof val === "number" ? String(val) : val };
        });
      };

      // Common fields
      merge("brand", ex.brand);
      merge("model", ex.model);
      merge("first_registration", ex.first_registration);
      merge("vin", ex.vin);
      merge("color", ex.color);
      merge("fuel", ex.fuel);
      merge("body_type", ex.body_type);
      merge("displacement_cc", ex.displacement_cc);
      merge("power_kw", ex.power_kw);
      merge("gross_weight_kg", ex.gross_weight_kg);
      merge("sitting_places", ex.sitting_places);

      if (mode === "fahrzeugschein") {
        merge("license_plate", ex.license_plate);
        // Derive PS from kW if PS empty
        if (ex.power_kw != null) {
          const hp = Math.round(Number(ex.power_kw) * 1.35962);
          merge("power_hp", hp);
        }
      } else {
        // Inserat-only fields
        merge("year", ex.year);
        merge("mileage", ex.mileage);
        merge("price", ex.price);
        merge("transmission", ex.transmission);
        merge("power_hp", ex.power_hp);
        merge("sleeping_places", ex.sleeping_places);
        merge("length_mm", ex.length_mm);
        merge("width_mm", ex.width_mm);
        merge("height_mm", ex.height_mm);
        if (Array.isArray(ex.features) && ex.features.length) {
          setD((prev: any) => {
            if (prev.features && prev.features.trim()) return prev;
            const cleaned = ex.features.filter((f: string) => !/halter|vorbesitz|\d\.\s*hand/i.test(f));
            return { ...prev, features: cleaned.join("\n") };
          });
        }
      }

      const filled = Object.keys(ex).filter(k => ex[k] != null && ex[k] !== "").length;
      toast.success(`${filled} Feld${filled === 1 ? "" : "er"} übernommen — bitte prüfen`);
    } catch (err: any) {
      toast.error(err.message ?? "Konnte Datei nicht auswerten");
    } finally {
      setExtracting(null);
    }
  };

  const save = async () => {
    if (!d.brand || !d.model) { toast.error("Marke und Modell sind erforderlich"); return; }
    setSaving(true);
    try {
      const payload: any = {
        brand: d.brand, model: d.model,
        year: num(d.year, parseInt),
        first_registration: d.first_registration || null,
        mileage: num(d.mileage, parseInt),
        price: num(d.price, parseFloat),
        purchase_price: num(d.purchase_price, parseFloat),
        sale_price: num(d.sale_price, parseFloat),
        vin: d.vin || null, color: d.color || null,
        license_plate: d.license_plate || null,
        fuel: d.fuel || null, transmission: d.transmission || null,
        power_hp: num(d.power_hp, parseInt),
        power_kw: num(d.power_kw, parseInt),
        displacement_cc: num(d.displacement_cc, parseInt),
        body_type: d.body_type || null,
        sleeping_places: num(d.sleeping_places, parseInt),
        sitting_places: num(d.sitting_places, parseInt),
        length_mm: num(d.length_mm, parseInt),
        width_mm: num(d.width_mm, parseInt),
        height_mm: num(d.height_mm, parseInt),
        gross_weight_kg: num(d.gross_weight_kg, parseInt),
        features: (d.features ?? "").split("\n").map((s: string) => s.trim()).filter(Boolean),
        notes: d.notes || null, status: d.status,
      };

      let id = motorhomeId;
      if (motorhomeId) {
        const { error } = await supabase.from("motorhomes").update(payload).eq("id", motorhomeId);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id;
        const { data: ins, error } = await supabase.from("motorhomes").insert(payload).select().single();
        if (error) throw error;
        id = ins.id;
      }
      toast.success(motorhomeId ? "Wohnmobil aktualisiert" : "Wohnmobil angelegt");
      navigate({ to: "/wohnmobile/$id", params: { id: id! } });
    } catch (err: any) {
      toast.error(err.message ?? "Speichern fehlgeschlagen");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const busy = extracting !== null;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{motorhomeId ? "Wohnmobil bearbeiten" : "Neues Wohnmobil"}</h1>

      <Card className="p-6 bg-muted/40">
        <h2 className="font-semibold mb-1">Automatisch ausfüllen</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Lade ein Inserat-PDF (z.B. mobile.de) oder einen Fahrzeugschein (PDF/Foto) hoch — die Felder werden befüllt. Bestehende Eingaben bleiben unverändert.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            ref={inseratInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) extractFromFile(f, "inserat");
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inseratInputRef.current?.click()}
          >
            {extracting === "inserat"
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lese Inserat…</>
              : <><FileText className="h-4 w-4 mr-2" /> Inserat-PDF auslesen</>}
          </Button>

          <input
            ref={scheinInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) extractFromFile(f, "fahrzeugschein");
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => scheinInputRef.current?.click()}
          >
            {extracting === "fahrzeugschein"
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lese Fahrzeugschein…</>
              : <><IdCard className="h-4 w-4 mr-2" /> Fahrzeugschein auslesen</>}
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Basis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Marke *"><Input value={d.brand ?? ""} onChange={e => set("brand", e.target.value)} /></Field>
          <Field label="Modell *"><Input value={d.model ?? ""} onChange={e => set("model", e.target.value)} /></Field>
          <Field label="Kennzeichen"><Input value={d.license_plate ?? ""} onChange={e => set("license_plate", e.target.value)} placeholder="MD-AB 1234" /></Field>
          <Field label="Baujahr"><Input type="number" value={d.year ?? ""} onChange={e => set("year", e.target.value)} /></Field>
          <Field label="Erstzulassung"><Input type="date" value={d.first_registration ?? ""} onChange={e => set("first_registration", e.target.value)} /></Field>
          <Field label="Kilometerstand"><Input type="number" value={d.mileage ?? ""} onChange={e => set("mileage", e.target.value)} /></Field>
          <Field label="Listenpreis (€)"><Input type="number" step="0.01" value={d.price ?? ""} onChange={e => set("price", e.target.value)} /></Field>
          <Field label="Einkaufspreis EK (€)"><Input type="number" step="0.01" value={d.purchase_price ?? ""} onChange={e => set("purchase_price", e.target.value)} /></Field>
          <Field label="Tatsächlicher Verkaufspreis VK (€)"><Input type="number" step="0.01" value={d.sale_price ?? ""} onChange={e => set("sale_price", e.target.value)} /></Field>
          <Field label="Status">
            <Select value={d.status} onValueChange={v => set("status", v as VehicleStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Wohnmobil-Daten</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Aufbau">
            <Select value={d.body_type ?? ""} onValueChange={v => set("body_type", v as MotorhomeBodyType)}>
              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(BODY_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Schlafplätze"><Input type="number" value={d.sleeping_places ?? ""} onChange={e => set("sleeping_places", e.target.value)} /></Field>
          <Field label="Sitzplätze"><Input type="number" value={d.sitting_places ?? ""} onChange={e => set("sitting_places", e.target.value)} /></Field>
          <Field label="Zul. Gesamtgewicht (kg)"><Input type="number" value={d.gross_weight_kg ?? ""} onChange={e => set("gross_weight_kg", e.target.value)} /></Field>
          <Field label="Länge (mm)"><Input type="number" value={d.length_mm ?? ""} onChange={e => set("length_mm", e.target.value)} /></Field>
          <Field label="Breite (mm)"><Input type="number" value={d.width_mm ?? ""} onChange={e => set("width_mm", e.target.value)} /></Field>
          <Field label="Höhe (mm)"><Input type="number" value={d.height_mm ?? ""} onChange={e => set("height_mm", e.target.value)} /></Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Technische Daten</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="VIN"><Input value={d.vin ?? ""} onChange={e => set("vin", e.target.value)} /></Field>
          <Field label="Farbe"><Input value={d.color ?? ""} onChange={e => set("color", e.target.value)} /></Field>
          <Field label="Kraftstoff">
            <Select value={d.fuel ?? ""} onValueChange={v => set("fuel", v as FuelType)}>
              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(FUEL_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Getriebe">
            <Select value={d.transmission ?? ""} onValueChange={v => set("transmission", v as TransmissionType)}>
              <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>
                {Object.entries(TRANSMISSION_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Leistung (PS)"><Input type="number" value={d.power_hp ?? ""} onChange={e => set("power_hp", e.target.value)} /></Field>
          <Field label="Leistung (kW)"><Input type="number" value={d.power_kw ?? ""} onChange={e => set("power_kw", e.target.value)} /></Field>
          <Field label="Hubraum (cm³)"><Input type="number" value={d.displacement_cc ?? ""} onChange={e => set("displacement_cc", e.target.value)} /></Field>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Ausstattung & Notizen</h2>
        <Field label="Ausstattung (eine pro Zeile)">
          <Textarea rows={6} value={d.features ?? ""} onChange={e => set("features", e.target.value)} placeholder="Markise&#10;Solaranlage&#10;Sat-Anlage" />
        </Field>
        <div className="mt-4">
          <Field label="Interne Notizen">
            <Textarea rows={3} value={d.notes ?? ""} onChange={e => set("notes", e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate({ to: "/wohnmobile" })}>Abbrechen</Button>
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
