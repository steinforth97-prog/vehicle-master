import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { DocumentScanner, type IdData, type Zb1Data, type BookingData } from "@/components/DocumentScanner";
import { AiInvoiceAssistant, type InvoiceSuggestion } from "@/components/AiInvoiceAssistant";
import { Eye, Loader2, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  generateFreeInvoice,
  generateWorkshopInvoice,
  generateLeakTest,
  generateMotorhomeInvoice,
  buildExternalMotorhome,
  LEAK_RESULT_LABELS,
  type CompanyData,
  type WorkshopPosition,
  type LeakResult,
} from "@/lib/motorhome-docs";

export type ExternalInvoiceType =
  | "werkstattrechnung"
  | "dichtigkeitspruefung"
  | "freie_rechnung"
  | "kommissionsverkauf";

export const EXTERNAL_INVOICE_LABELS: Record<ExternalInvoiceType, string> = {
  werkstattrechnung: "Werkstattrechnung",
  dichtigkeitspruefung: "Dichtigkeitsprüfung",
  freie_rechnung: "Freie Rechnung",
  kommissionsverkauf: "Kommissionsverkauf",
};

interface Props {
  company: CompanyData;
  onClose: () => void;
  onSaved?: () => void;
}

const BUCKET = "vehicle-documents";
const todayIso = () => new Date().toISOString().slice(0, 10);
const parseNum = (s: string) => {
  const n = Number(String(s).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export function ExternalInvoiceDialog({ company, onClose, onSaved }: Props) {
  const [type, setType] = useState<ExternalInvoiceType>("werkstattrechnung");
  const [busy, setBusy] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFilename, setPreviewFilename] = useState("dokument.pdf");

  const [date, setDate] = useState(todayIso());
  const [docNumber, setDocNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // Vehicle (free entry)
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [vin, setVin] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [firstRegistration, setFirstRegistration] = useState("");
  const [mileage, setMileage] = useState("");

  // Invoice common
  const [vatRate, setVatRate] = useState("19");
  const [diff, setDiff] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Überweisung");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [positions, setPositions] = useState<WorkshopPosition[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);

  // Workshop
  const [workshop, setWorkshop] = useState("");

  // Leak test
  const [inspector, setInspector] = useState("");
  const [leakResult, setLeakResult] = useState<LeakResult>("bestanden");
  const [measurements, setMeasurements] = useState("");
  const [nextTestDate, setNextTestDate] = useState("");

  // Commission sale
  const [salePrice, setSalePrice] = useState("");

  useEffect(() => {
    setDocNumber("RN-");
  }, [type]);

  const showVehicle = type !== "freie_rechnung" || true; // always show, optional for freie
  const showPositions = type === "werkstattrechnung" || type === "freie_rechnung";
  const requireVehicle = type === "dichtigkeitspruefung" || type === "kommissionsverkauf";

  const vehiclePayload = useMemo(() => ({
    brand: brand.trim(),
    model: model.trim(),
    vin: vin.trim(),
    license_plate: licensePlate.trim(),
    first_registration: firstRegistration.trim(),
    mileage: mileage.trim() ? parseNum(mileage) : null,
  }), [brand, model, vin, licensePlate, firstRegistration, mileage]);

  const buildDoc = async (): Promise<{ doc: jsPDF; filename: string; total: number | null }> => {
    if (!customerName.trim()) throw new Error("Bitte Kundenname eingeben.");
    if (requireVehicle && !brand.trim() && !vin.trim() && !licensePlate.trim()) {
      throw new Error("Bitte mindestens Marke, VIN oder Kennzeichen angeben.");
    }

    const safeBase = `${type}-${(customerName || "kunde").replace(/\s+/g, "_")}-${date}`;
    const filename = `${safeBase}.pdf`;

    if (type === "freie_rechnung") {
      const cleanPositions = positions.filter((p) => p.description.trim().length > 0);
      if (cleanPositions.length === 0) throw new Error("Mindestens eine Position erforderlich.");
      const doc = await generateFreeInvoice(company, {
        invoiceNumber: docNumber || `RE-${date}`,
        date,
        title: title || "Rechnung",
        customerName,
        customerAddress,
        vehicle: brand || vin || licensePlate ? {
          brand: vehiclePayload.brand,
          model: vehiclePayload.model,
          vin: vehiclePayload.vin,
          license_plate: vehiclePayload.license_plate,
          first_registration: vehiclePayload.first_registration,
          mileage: vehiclePayload.mileage,
        } : undefined,
        positions: cleanPositions,
        vatRate: diff ? 0 : parseNum(vatRate),
        diff,
        paymentMethod,
        notes,
      });
      const net = cleanPositions.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
      const total = diff ? net : net * (1 + parseNum(vatRate) / 100);
      return { doc, filename, total };
    }

    const mh = buildExternalMotorhome({
      brand: vehiclePayload.brand,
      model: vehiclePayload.model,
      vin: vehiclePayload.vin,
      license_plate: vehiclePayload.license_plate,
      first_registration: vehiclePayload.first_registration,
      mileage: vehiclePayload.mileage,
      price: salePrice ? parseNum(salePrice) : null,
    });

    if (type === "werkstattrechnung") {
      const cleanPositions = positions.filter((p) => p.description.trim().length > 0);
      if (cleanPositions.length === 0) throw new Error("Mindestens eine Position erforderlich.");
      const doc = await generateWorkshopInvoice(mh, company, {
        invoiceNumber: docNumber || `WS-${date}`,
        date,
        workshop,
        customerName,
        customerAddress,
        positions: cleanPositions,
        vatRate: parseNum(vatRate),
        notes,
      });
      const net = cleanPositions.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
      const total = net * (1 + parseNum(vatRate) / 100);
      return { doc, filename, total };
    }

    if (type === "dichtigkeitspruefung") {
      const doc = await generateLeakTest(mh, company, {
        testDate: date,
        inspector,
        workshop,
        result: leakResult,
        measurements,
        nextTestDate,
        notes,
      });
      return { doc, filename, total: null };
    }

    // kommissionsverkauf — Verkaufsrechnung mit Fremdfahrzeug
    const price = parseNum(salePrice);
    if (!price) throw new Error("Bitte Verkaufspreis eingeben.");
    mh.price = price;
    const doc = await generateMotorhomeInvoice(mh, company, {
      buyerName: customerName,
      buyerAddress: customerAddress,
      invoiceNumber: docNumber || `KO-${date}`,
      date,
      vatRate: diff ? 0 : parseNum(vatRate),
      paymentMethod,
    });
    return { doc, filename, total: price };
  };

  const handlePreview = async () => {
    setBusy(true);
    try {
      const { doc, filename } = await buildDoc();
      setPreviewFilename(filename);
      setPreviewBlob(doc.output("blob"));
    } catch (e: any) {
      toast.error(e.message ?? "Fehler beim Erstellen der Vorschau");
    } finally { setBusy(false); }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const { doc, filename, total } = await buildDoc();
      const blob: Blob = doc.output("blob");
      const path = `external/${Date.now()}-${filename}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { data: u } = await supabase.auth.getUser();

      await supabase.from("external_invoices").insert({
        type,
        document_number: docNumber || null,
        invoice_date: date,
        customer_name: customerName,
        customer_address: customerAddress || null,
        vehicle: vehiclePayload,
        data: {
          title, notes, paymentMethod, vatRate: parseNum(vatRate), diff,
          positions: positions.map((p) => ({ ...p })),
          workshop, inspector, leakResult, measurements, nextTestDate,
          salePrice: salePrice ? parseNum(salePrice) : null,
        } as any,
        total_amount: total != null ? Number(total.toFixed(2)) : null,
        storage_path: path,
        url: pub.publicUrl,
        created_by: u.user?.id,
      });

      toast.success(`${EXTERNAL_INVOICE_LABELS[type]} gespeichert`);
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    } finally { setBusy(false); }
  };

  const updatePos = (i: number, patch: Partial<WorkshopPosition>) =>
    setPositions((prev) => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const addPos = () => setPositions((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }]);
  const removePos = (i: number) => setPositions((p) => p.filter((_, idx) => idx !== i));

  const applyBookingAndSuggest = async (d: BookingData) => {
    if (d.customer_name) setCustomerName(d.customer_name);
    const addr = d.customer_address ?? [d.customer_street, [d.customer_zip, d.customer_city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
    if (addr) setCustomerAddress(addr);
    if (d.vehicle_brand) setBrand(d.vehicle_brand);
    if (d.vehicle_model) setModel(d.vehicle_model);
    if (d.vehicle_vin) setVin(d.vehicle_vin);
    if (d.vehicle_license_plate) setLicensePlate(d.vehicle_license_plate);
    if (d.mileage_in != null) setMileage(String(d.mileage_in));
    else if (d.mileage_out != null) setMileage(String(d.mileage_out));

    const ctxLines = [
      d.booking_number ? `Buchung: ${d.booking_number}` : null,
      d.rental_start || d.rental_end ? `Mietzeitraum: ${d.rental_start ?? "?"} – ${d.rental_end ?? "?"}` : null,
      d.mileage_out != null || d.mileage_in != null ? `Kilometerstand: ${d.mileage_out ?? "?"} -> ${d.mileage_in ?? "?"} km` : null,
      d.additional_notes ?? null,
    ].filter(Boolean);
    const damage = d.damage_description?.trim() ?? "";
    setNotes((prev) => [prev, ctxLines.join("\n"), damage ? `Schäden:\n${damage}` : ""].filter(Boolean).join("\n\n"));

    if (!damage) {
      toast.info("Buchungsdaten übernommen – keine Schadensbeschreibung erkannt.");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-invoice-positions", {
        body: {
          description: damage,
          images: [],
          docType: "Werkstattrechnung (Schadensabrechnung Mietfahrzeug)",
          vehicle: {
            brand: d.vehicle_brand, model: d.vehicle_model, vin: d.vehicle_vin,
            license_plate: d.vehicle_license_plate,
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const s = (data as any)?.data as InvoiceSuggestion | undefined;
      if (s?.positions?.length) {
        setPositions(s.positions.map((p) => ({
          description: p.description, quantity: Number(p.quantity) || 1, unitPrice: Number(p.unitPrice) || 0,
        })));
        if (s.title) setTitle(s.title);
        if (s.summary || s.notes) {
          setNotes([s.summary, s.notes].filter(Boolean).join("\n\n"));
        }
        toast.success("Buchungsdaten übernommen & Rechnungsvorschlag erstellt");
      } else {
        toast.success("Buchungsdaten übernommen");
      }
    } catch (e: any) {
      toast.error(e.message ?? "KI-Vorschlag fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o && !previewBlob) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rechnung für Fremdkunde erstellen</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rechnungsart</Label>
                <Select value={type} onValueChange={(v) => setType(v as ExternalInvoiceType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXTERNAL_INVOICE_LABELS).map(([k, l]) => (
                      <SelectItem key={k} value={k}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Belegnummer</Label>
                <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
              </div>
              <div>
                <Label>Datum</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {type === "freie_rechnung" && (
                <div>
                  <Label>Titel</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rechnung" />
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kunde</div>
                <DocumentScanner
                  mode="id"
                  onIdScanned={(d: IdData) => {
                    if (d.full_name) setCustomerName(d.full_name);
                    else if (d.first_name || d.last_name) setCustomerName(`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim());
                    const addr = d.address ?? [d.street, [d.zip, d.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                    if (addr) setCustomerAddress(addr);
                  }}
                />
              </div>
              <div className="space-y-2">
                <div>
                  <Label>Name</Label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </div>
                <div>
                  <Label>Anschrift</Label>
                  <Textarea rows={2} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Straße&#10;PLZ Ort" />
                </div>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fahrzeug {requireVehicle ? "" : "(optional)"}
                </div>
                <DocumentScanner
                  mode="zb1"
                  onZb1Scanned={(d: Zb1Data) => {
                    if (d.brand) setBrand(d.brand);
                    if (d.model) setModel(d.model);
                    if (d.vin) setVin(d.vin);
                    if (d.license_plate) setLicensePlate(d.license_plate);
                    if (d.first_registration) setFirstRegistration(d.first_registration);
                    if (d.owner_name && !customerName) setCustomerName(d.owner_name);
                    const addr = d.owner_address ?? [d.owner_street, [d.owner_zip, d.owner_city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                    if (addr && !customerAddress) setCustomerAddress(addr);
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Marke</Label>
                  <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
                </div>
                <div>
                  <Label>Modell</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
                <div>
                  <Label>Kennzeichen</Label>
                  <Input value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
                </div>
                <div>
                  <Label>VIN</Label>
                  <Input value={vin} onChange={(e) => setVin(e.target.value)} />
                </div>
                <div>
                  <Label>Erstzulassung</Label>
                  <Input value={firstRegistration} onChange={(e) => setFirstRegistration(e.target.value)}
                    placeholder="MM/YYYY" />
                </div>
                <div>
                  <Label>Kilometerstand</Label>
                  <Input value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="km" />
                </div>
              </div>
            </div>


            {type === "werkstattrechnung" && (
              <div className="rounded border border-dashed bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">Schadensrechnung aus Buchung</div>
                    <div className="text-xs text-muted-foreground">
                      Buchung, Mietvertrag oder Übergabeprotokoll scannen – Kunden- und Fahrzeugdaten werden übernommen und die KI erzeugt einen Rechnungsvorschlag.
                    </div>
                  </div>
                  <DocumentScanner
                    mode="booking"
                    onBookingScanned={(d) => { void applyBookingAndSuggest(d); }}
                  />
                </div>
              </div>
            )}

            {showPositions && (
              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <Label>Positionen</Label>
                  <div className="flex gap-2">
                    <AiInvoiceAssistant
                      docType={EXTERNAL_INVOICE_LABELS[type]}
                      vehicle={vehiclePayload}
                      onSuggested={(s: InvoiceSuggestion) => {
                        const newPositions = s.positions.map((p) => ({
                          description: p.description, quantity: Number(p.quantity) || 1, unitPrice: Number(p.unitPrice) || 0,
                        }));
                        setPositions(newPositions.length ? newPositions : [{ description: "", quantity: 1, unitPrice: 0 }]);
                        if (s.title) setTitle(s.title);
                        if (s.summary || s.notes) {
                          setNotes([s.summary, s.notes].filter(Boolean).join("\n\n"));
                        }
                      }}
                    />
                    <Button type="button" size="sm" variant="outline" onClick={addPos}>
                      <Plus className="h-3 w-3 mr-1" /> Position
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {positions.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_70px_90px_32px] gap-2 items-center">
                      <Input value={p.description} onChange={(e) => updatePos(i, { description: e.target.value })} placeholder="Beschreibung" />
                      <Input type="number" value={p.quantity} onChange={(e) => updatePos(i, { quantity: Number(e.target.value) || 0 })} />
                      <Input type="number" value={p.unitPrice} onChange={(e) => updatePos(i, { unitPrice: Number(e.target.value) || 0 })} placeholder="€" />
                      <Button type="button" size="icon" variant="ghost" onClick={() => removePos(i)} disabled={positions.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {type === "werkstattrechnung" && (
              <div>
                <Label>Werkstatt</Label>
                <Input value={workshop} onChange={(e) => setWorkshop(e.target.value)} />
              </div>
            )}

            {type === "dichtigkeitspruefung" && (
              <div className="border-t pt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Prüfer</Label>
                    <Input value={inspector} onChange={(e) => setInspector(e.target.value)} />
                  </div>
                  <div>
                    <Label>Werkstatt</Label>
                    <Input value={workshop} onChange={(e) => setWorkshop(e.target.value)} />
                  </div>
                  <div>
                    <Label>Ergebnis</Label>
                    <Select value={leakResult} onValueChange={(v) => setLeakResult(v as LeakResult)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(LEAK_RESULT_LABELS).map(([k, l]) => (
                          <SelectItem key={k} value={k}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Nächste Prüfung</Label>
                    <Input type="date" value={nextTestDate} onChange={(e) => setNextTestDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Messwerte</Label>
                  <Textarea rows={3} value={measurements} onChange={(e) => setMeasurements(e.target.value)}
                    placeholder="Dach links: 12 %&#10;Heck: 14 %" />
                </div>
              </div>
            )}

            {type === "kommissionsverkauf" && (
              <div>
                <Label>Verkaufspreis (EUR)</Label>
                <Input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
              </div>
            )}

            {(type === "werkstattrechnung" || type === "freie_rechnung" || type === "kommissionsverkauf") && (
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <Label>MwSt.-Satz (%)</Label>
                  <Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} disabled={diff} />
                </div>
                {(type === "freie_rechnung" || type === "kommissionsverkauf") && (
                  <label className="flex items-center gap-2 text-sm h-10">
                    <input type="checkbox" checked={diff} onChange={(e) => setDiff(e.target.checked)} />
                    Differenzbesteuerung (§ 25a)
                  </label>
                )}
                {(type === "freie_rechnung" || type === "kommissionsverkauf") && (
                  <div className="col-span-2">
                    <Label>Zahlungsart</Label>
                    <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Notizen</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
            <Button variant="secondary" onClick={handlePreview} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              Vorschau
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewBlob && (
        <PrintPreviewDialog
          open
          onClose={() => setPreviewBlob(null)}
          source={previewBlob}
          title="Rechnungsvorschau"
          filename={previewFilename}
        />
      )}
    </>
  );
}
