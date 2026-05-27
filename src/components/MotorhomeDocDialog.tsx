import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { DocumentScanner, type IdData, type BookingData } from "@/components/DocumentScanner";
import { AiInvoiceAssistant, type InvoiceSuggestion } from "@/components/AiInvoiceAssistant";
import { Eye, Loader2, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { MOTORHOME_DOC_LABELS, type MotorhomeDocType } from "@/lib/motorhomes";
import {
  generateMotorhomeInvoice,
  generateMotorhomeOrder,
  generateLeakTest,
  generateWorkshopInvoice,
  generateMotorhomeOffer,
  generateMotorhomePriceSign,
  generateFinancingPoster,
  type MotorhomeForPdf,
  type CompanyData,
  type WorkshopPosition,
  type LeakResult,
  LEAK_RESULT_LABELS,
} from "@/lib/motorhome-docs";

interface ExistingRecord {
  id: string;
  document_number: string | null;
  buyer_name: string | null;
  buyer_address: string | null;
  data: any;
}

interface Props {
  type: MotorhomeDocType;
  motorhome: MotorhomeForPdf;
  company: CompanyData;
  existingRecord?: ExistingRecord;
  onClose: () => void;
  onSaved?: () => void;
}

const BUCKET = "vehicle-documents";

const titles: Record<MotorhomeDocType, string> = {
  verkaufsrechnung: "Verkaufsrechnung erstellen",
  verbindliche_bestellung: "Verbindliche Bestellung erstellen",
  dichtigkeitspruefung: "Dichtigkeitsprüfung erstellen",
  werkstattrechnung: "Werkstattrechnung erstellen",
  angebot: "Angebot erstellen",
  verkaufsschild: "Verkaufsschild erstellen",
  finanzierungsangebot: "Finanzierungs-Aushang erstellen",
};

function todayIso() { return new Date().toISOString().slice(0, 10); }

export function MotorhomeDocDialog({ type, motorhome, company, existingRecord, onClose, onSaved }: Props) {
  const isEditing = !!existingRecord;
  const [busy, setBusy] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFilename, setPreviewFilename] = useState("dokument.pdf");

  // shared
  const [date, setDate] = useState(todayIso());
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");

  // invoice / order
  const [docNumber, setDocNumber] = useState("");
  const [vatRate, setVatRate] = useState("19");
  const [diff, setDiff] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Überweisung");

  // order
  const [vehiclePrice, setVehiclePrice] = useState<string>(motorhome.price != null ? String(motorhome.price) : "");
  const [deposit, setDeposit] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [conditions, setConditions] = useState("");

  // leak test
  const [inspector, setInspector] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [leakResult, setLeakResult] = useState<LeakResult>("bestanden");
  const [measurements, setMeasurements] = useState("");
  const [nextTestDate, setNextTestDate] = useState("");
  const [leakNotes, setLeakNotes] = useState("");

  // workshop invoice / angebot
  const [positions, setPositions] = useState<WorkshopPosition[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [workshopNotes, setWorkshopNotes] = useState("");
  const [validUntil, setValidUntil] = useState("");

  // price sign
  const [signPrice, setSignPrice] = useState<string>(motorhome.price != null ? String(motorhome.price) : "");
  const [signHighlights, setSignHighlights] = useState<string>(
    (motorhome.features ?? []).slice(0, 5).join(" · "),
  );
  const [signFootline, setSignFootline] = useState<string>(company.company_name ?? "");

  // financing
  const suggestedRate = motorhome.price ? Math.max(1, Math.round(motorhome.price / 96)) : 0;
  const [finRate, setFinRate] = useState<string>(suggestedRate ? String(suggestedRate) : "");
  const [finDisclaimer, setFinDisclaimer] = useState<string>(
    "Das Ratenbeispiel bezieht sich auf das Finanzierungsangebot der Santander Consumer Bank",
  );
  const [finFootline, setFinFootline] = useState<string>("0% ANZAHLEN  FLEXIBLE FINANZIEREN");

  useEffect(() => {
    // Prefill doc number when relevant
    if (type === "verkaufsrechnung") {
      setDocNumber("RN-");
    } else if (type === "verbindliche_bestellung") {
      setDocNumber("RN-");
    } else if (type === "werkstattrechnung") {
      setDocNumber("RN-");
    } else if (type === "angebot") {
      setDocNumber("AN-");
    }
  }, [type]);

  // Prefill from existing record (edit mode)
  useEffect(() => {
    if (!existingRecord) return;
    const d = existingRecord.data ?? {};
    if (existingRecord.document_number) setDocNumber(existingRecord.document_number);
    if (existingRecord.buyer_name) setBuyerName(existingRecord.buyer_name);
    if (existingRecord.buyer_address) setBuyerAddress(existingRecord.buyer_address);
    if (d.date) setDate(d.date);
    if (d.vatRate != null) setVatRate(String(d.vatRate));
    if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
    if (d.vehiclePrice != null) setVehiclePrice(String(d.vehiclePrice));
    if (d.deposit != null) setDeposit(String(d.deposit));
    if (d.deliveryDate) setDeliveryDate(d.deliveryDate);
    if (d.conditions) setConditions(d.conditions);
    if (d.inspector) setInspector(d.inspector);
    if (d.workshop) setWorkshop(d.workshop);
    if (d.result) setLeakResult(d.result);
    if (d.measurements) setMeasurements(d.measurements);
    if (d.nextTestDate) setNextTestDate(d.nextTestDate);
    if (d.testDate) setDate(d.testDate);
    if (d.notes != null) { setLeakNotes(d.notes); setWorkshopNotes(d.notes); }
    if (Array.isArray(d.positions) && d.positions.length) setPositions(d.positions);
    if (d.validUntil) setValidUntil(d.validUntil);
    if (d.price != null) setSignPrice(String(d.price));
    if (d.highlights) setSignHighlights(d.highlights);
    if (d.footline) { setSignFootline(d.footline); setFinFootline(d.footline); }
    if (d.monthlyRate != null) setFinRate(String(d.monthlyRate));
    if (d.disclaimer) setFinDisclaimer(d.disclaimer);
  }, [existingRecord]);

  const parseNum = (s: string) => {
    const n = Number(String(s).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const buildDoc = async (): Promise<{ doc: jsPDF; filename: string; recordData: any }> => {
    let doc: jsPDF;
    let recordData: any = { date };
    const safeName = `${type}-${motorhome.brand}-${motorhome.model}-${date}.pdf`.replace(/\s+/g, "_");

    if (type === "verkaufsrechnung") {
      doc = await generateMotorhomeInvoice(motorhome, company, {
        buyerName, buyerAddress,
        invoiceNumber: docNumber || `RE-${date}`,
        date,
        vatRate: diff ? 0 : parseNum(vatRate),
        paymentMethod,
      });
      recordData = { ...recordData, invoiceNumber: docNumber, vatRate: diff ? 0 : parseNum(vatRate), paymentMethod };
    } else if (type === "verbindliche_bestellung") {
      const vp = parseNum(vehiclePrice);
      doc = await generateMotorhomeOrder(motorhome, company, {
        buyerName, buyerAddress,
        orderNumber: docNumber || `BE-${date}`,
        date,
        vehiclePrice: vp,
        deposit: parseNum(deposit),
        deliveryDate,
        conditions,
        place: company.address_city ?? undefined,
      });
      recordData = { ...recordData, orderNumber: docNumber, vehiclePrice: vp, deposit: parseNum(deposit), deliveryDate, conditions };
    } else if (type === "dichtigkeitspruefung") {
      doc = await generateLeakTest(motorhome, company, {
        testDate: date,
        inspector,
        workshop,
        result: leakResult,
        measurements,
        nextTestDate,
        notes: leakNotes,
      });
      recordData = { testDate: date, inspector, workshop, result: leakResult, measurements, nextTestDate, notes: leakNotes };
    } else if (type === "werkstattrechnung") {
      doc = await generateWorkshopInvoice(motorhome, company, {
        invoiceNumber: docNumber || `WS-${date}`,
        date,
        workshop,
        customerName: buyerName,
        customerAddress: buyerAddress,
        positions: positions.filter((p) => p.description.trim().length > 0),
        vatRate: parseNum(vatRate),
        notes: workshopNotes,
      });
      recordData = { ...recordData, invoiceNumber: docNumber, workshop, positions, vatRate: parseNum(vatRate), notes: workshopNotes };
    } else if (type === "angebot") {
      doc = await generateMotorhomeOffer(motorhome, company, {
        offerNumber: docNumber || `AN-${date}`,
        date,
        validUntil: validUntil || undefined,
        customerName: buyerName,
        customerAddress: buyerAddress,
        positions: positions.filter((p) => p.description.trim().length > 0),
        vatRate: parseNum(vatRate),
        notes: workshopNotes,
      });
      recordData = { ...recordData, offerNumber: docNumber, validUntil, positions, vatRate: parseNum(vatRate), notes: workshopNotes };
    } else if (type === "verkaufsschild") {
      doc = await generateMotorhomePriceSign(motorhome, company, {
        price: signPrice.trim() ? parseNum(signPrice) : motorhome.price,
        highlights: signHighlights,
        footline: signFootline,
      });
      recordData = { price: parseNum(signPrice), highlights: signHighlights, footline: signFootline };
    } else {
      // finanzierungsangebot
      const r = parseNum(finRate);
      if (!r) throw new Error("Bitte eine gültige Monatsrate eingeben.");
      doc = await generateFinancingPoster({
        monthlyRate: r,
        disclaimer: finDisclaimer || undefined,
        footline: finFootline || undefined,
      });
      recordData = { monthlyRate: r, disclaimer: finDisclaimer, footline: finFootline };
    }

    return { doc, filename: safeName, recordData };
  };

  const handlePreview = async () => {
    setBusy(true);
    try {
      const { doc, filename } = await buildDoc();
      const blob: Blob = doc.output("blob");
      setPreviewFilename(filename);
      setPreviewBlob(blob);
    } catch (e: any) {
      toast.error(e.message ?? "Fehler beim Erstellen der Vorschau");
    } finally { setBusy(false); }
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const { doc, filename, recordData } = await buildDoc();
      const blob: Blob = doc.output("blob");

      const path = `motorhomes/${motorhome.id}/${Date.now()}-${filename}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET).upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const { data: u } = await supabase.auth.getUser();

      const totalAmount =
        type === "verkaufsrechnung" ? motorhome.price
        : type === "verbindliche_bestellung" ? parseNum(vehiclePrice)
        : (type === "werkstattrechnung" || type === "angebot")
          ? positions.reduce((s, p) => s + p.quantity * p.unitPrice, 0) * (1 + parseNum(vatRate) / 100)
        : null;

      await supabase.from("motorhome_documents").insert({
        motorhome_id: motorhome.id,
        name: filename.replace(/\.pdf$/i, ""),
        storage_path: path,
        url: pub.publicUrl,
        page_count: 1,
        created_by: u.user?.id,
      });

      const recordPayload = {
        motorhome_id: motorhome.id,
        type,
        document_number: (type === "verkaufsrechnung" || type === "verbindliche_bestellung" || type === "werkstattrechnung" || type === "angebot") ? (docNumber || null) : null,
        buyer_name: buyerName || null,
        buyer_address: buyerAddress || null,
        total_amount: totalAmount != null ? Number(totalAmount.toFixed(2)) : null,
        data: recordData,
      };

      if (isEditing && existingRecord) {
        await supabase.from("motorhome_doc_records").update(recordPayload).eq("id", existingRecord.id);
      } else {
        await supabase.from("motorhome_doc_records").insert({ ...recordPayload, created_by: u.user?.id });
      }

      toast.success(`${MOTORHOME_DOC_LABELS[type]} gespeichert`);
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    } finally { setBusy(false); }
  };

  const updatePos = (i: number, patch: Partial<WorkshopPosition>) => {
    setPositions((prev) => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  };
  const addPos = () => setPositions((p) => [...p, { description: "", quantity: 1, unitPrice: 0 }]);
  const removePos = (i: number) => setPositions((p) => p.filter((_, idx) => idx !== i));

  const applyBookingAndSuggest = async (d: BookingData) => {
    // 1) Customer fields
    if (d.customer_name) setBuyerName(d.customer_name);
    const addr = d.customer_address ?? [d.customer_street, [d.customer_zip, d.customer_city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
    if (addr) setBuyerAddress(addr);

    // 2) Build notes block with booking context
    const ctxLines = [
      d.booking_number ? `Buchung: ${d.booking_number}` : null,
      d.rental_start || d.rental_end ? `Mietzeitraum: ${d.rental_start ?? "?"} – ${d.rental_end ?? "?"}` : null,
      d.mileage_out != null || d.mileage_in != null ? `Kilometerstand: ${d.mileage_out ?? "?"} -> ${d.mileage_in ?? "?"} km` : null,
      d.additional_notes ?? null,
    ].filter(Boolean);
    const damage = d.damage_description?.trim() ?? "";
    setWorkshopNotes((prev) => [prev, ctxLines.join("\n"), damage ? `Schäden:\n${damage}` : ""].filter(Boolean).join("\n\n"));

    if (!damage) {
      toast.info("Buchungsdaten übernommen – keine Schadensbeschreibung erkannt.");
      return;
    }

    // 3) Auto-call AI for invoice suggestion
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("suggest-invoice-positions", {
        body: {
          description: damage,
          images: [],
          docType: "Werkstattrechnung (Schadensabrechnung Mietfahrzeug)",
          vehicle: {
            brand: motorhome.brand, model: motorhome.model, vin: motorhome.vin,
            license_plate: (motorhome as any).license_plate, first_registration: motorhome.first_registration,
            mileage: motorhome.mileage,
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const s = (data as any)?.data;
      if (!s?.positions?.length) {
        toast.warning("KI hat keine Positionen vorgeschlagen – bitte manuell ergänzen.");
        return;
      }
      const newPositions = s.positions.map((p: any) => ({
        description: String(p.description ?? ""),
        quantity: Number(p.quantity) || 1,
        unitPrice: Number(p.unitPrice) || 0,
      }));
      setPositions(newPositions.length ? newPositions : [{ description: "", quantity: 1, unitPrice: 0 }]);
      if (s.summary || s.notes) {
        setWorkshopNotes([s.summary, s.notes].filter(Boolean).join("\n\n"));
      }
      toast.success("Rechnungsvorschlag aus Buchungsunterlagen erstellt");
    } catch (e: any) {
      toast.error(e.message ?? "KI-Vorschlag fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  };


  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o && !previewBlob) onClose(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{titles[type]}</DialogTitle></DialogHeader>

          <div className="space-y-4 py-2">
            {(type === "verkaufsrechnung" || type === "verbindliche_bestellung" || type === "werkstattrechnung" || type === "angebot") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Belegnummer</Label>
                  <Input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
                </div>
                <div>
                  <Label>Datum</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
            )}

            {type === "angebot" && (
              <div>
                <Label>Gültig bis (optional)</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            )}

            {(type === "verkaufsrechnung" || type === "verbindliche_bestellung" || type === "werkstattrechnung" || type === "angebot") && (
              <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label>{(type === "werkstattrechnung" || type === "angebot") ? "Kunde (optional)" : "Käufer-Name"}</Label>
                  <div className="flex gap-2">
                    <DocumentScanner
                      mode="id"
                      onIdScanned={(d: IdData) => {
                        if (d.full_name) setBuyerName(d.full_name);
                        else if (d.first_name || d.last_name) setBuyerName(`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim());
                        const addr = d.address ?? [d.street, [d.zip, d.city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                        if (addr) setBuyerAddress(addr);
                      }}
                    />
                    <DocumentScanner
                      mode="zb1"
                      label="ZB1 scannen"
                      onZb1Scanned={(d) => {
                        if (d.owner_name) setBuyerName(d.owner_name);
                        const addr = d.owner_address ?? [d.owner_street, [d.owner_zip, d.owner_city].filter(Boolean).join(" ")].filter(Boolean).join("\n");
                        if (addr) setBuyerAddress(addr);
                      }}
                    />
                  </div>
                </div>
                <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
                <div>
                  <Label>Anschrift</Label>
                  <Textarea rows={2} value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} placeholder="Straße&#10;PLZ Ort" />
                </div>
              </>
            )}


            {type === "verkaufsrechnung" && (
              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <Label>MwSt.-Satz (%)</Label>
                  <Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} disabled={diff} />
                </div>
                <label className="flex items-center gap-2 text-sm h-10">
                  <input type="checkbox" checked={diff} onChange={(e) => setDiff(e.target.checked)} />
                  Differenzbesteuerung (§ 25a)
                </label>
                <div className="col-span-2">
                  <Label>Zahlungsart</Label>
                  <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
                </div>
              </div>
            )}

            {type === "verbindliche_bestellung" && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Kaufpreis (EUR)</Label>
                    <Input value={vehiclePrice} onChange={(e) => setVehiclePrice(e.target.value)} />
                  </div>
                  <div>
                    <Label>Anzahlung (EUR)</Label>
                    <Input value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                  </div>
                  <div>
                    <Label>Lieferdatum</Label>
                    <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Bemerkungen (optional)</Label>
                  <Textarea rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} />
                </div>
              </>
            )}

            {type === "dichtigkeitspruefung" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Prüfdatum</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Nächste Prüfung</Label>
                    <Input type="date" value={nextTestDate} onChange={(e) => setNextTestDate(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Prüfer</Label>
                    <Input value={inspector} onChange={(e) => setInspector(e.target.value)} />
                  </div>
                  <div>
                    <Label>Werkstatt</Label>
                    <Input value={workshop} onChange={(e) => setWorkshop(e.target.value)} />
                  </div>
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
                  <Label>Messwerte (eine Zeile pro Messpunkt)</Label>
                  <Textarea rows={3} value={measurements} onChange={(e) => setMeasurements(e.target.value)}
                    placeholder="Dach links: 12 %&#10;Heck: 14 %&#10;…" />
                </div>
                <div>
                  <Label>Bemerkungen</Label>
                  <Textarea rows={2} value={leakNotes} onChange={(e) => setLeakNotes(e.target.value)} />
                </div>
              </>
            )}

            {type === "werkstattrechnung" && (
              <>
                <div className="rounded border border-dashed bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">Schadensrechnung aus Buchung</div>
                      <div className="text-xs text-muted-foreground">
                        Buchung, Mietvertrag oder Übergabeprotokoll scannen – Kundendaten und Schäden werden übernommen und die KI erzeugt einen Rechnungsvorschlag.
                      </div>
                    </div>
                    <DocumentScanner
                      mode="booking"
                      onBookingScanned={(d) => { void applyBookingAndSuggest(d); }}
                    />
                  </div>
                </div>
                <div>
                  <Label>Werkstatt</Label>
                  <Input value={workshop} onChange={(e) => setWorkshop(e.target.value)} placeholder="Name der Werkstatt" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Positionen</Label>
                    <div className="flex gap-2">
                      <AiInvoiceAssistant
                        docType="Werkstattrechnung"
                        vehicle={{
                          brand: motorhome.brand, model: motorhome.model, vin: motorhome.vin,
                          license_plate: (motorhome as any).license_plate, first_registration: motorhome.first_registration,
                          mileage: motorhome.mileage,
                        }}
                        onSuggested={(s: InvoiceSuggestion) => {
                          const newPositions = s.positions.map((p) => ({
                            description: p.description, quantity: Number(p.quantity) || 1, unitPrice: Number(p.unitPrice) || 0,
                          }));
                          setPositions(newPositions.length ? newPositions : [{ description: "", quantity: 1, unitPrice: 0 }]);
                          if (s.summary || s.notes) {
                            setWorkshopNotes([s.summary, s.notes].filter(Boolean).join("\n\n"));
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>MwSt.-Satz (%)</Label>
                    <Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Notizen</Label>
                  <Textarea rows={2} value={workshopNotes} onChange={(e) => setWorkshopNotes(e.target.value)} />
                </div>
              </>
            )}

            {type === "angebot" && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <Label>Positionen (z.B. Anhängerkupplung, Markise, Solar …)</Label>
                    <div className="flex gap-2">
                      <AiInvoiceAssistant
                        docType="Angebot (Zubehör/Anbauten für Wohnmobil)"
                        vehicle={{
                          brand: motorhome.brand, model: motorhome.model, vin: motorhome.vin,
                          license_plate: (motorhome as any).license_plate, first_registration: motorhome.first_registration,
                          mileage: motorhome.mileage,
                        }}
                        onSuggested={(s: InvoiceSuggestion) => {
                          const newPositions = s.positions.map((p) => ({
                            description: p.description, quantity: Number(p.quantity) || 1, unitPrice: Number(p.unitPrice) || 0,
                          }));
                          setPositions(newPositions.length ? newPositions : [{ description: "", quantity: 1, unitPrice: 0 }]);
                          if (s.summary || s.notes) {
                            setWorkshopNotes([s.summary, s.notes].filter(Boolean).join("\n\n"));
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>MwSt.-Satz (%)</Label>
                    <Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Notizen / Konditionen</Label>
                  <Textarea rows={2} value={workshopNotes} onChange={(e) => setWorkshopNotes(e.target.value)} placeholder="z.B. Einbau inkl., Lieferzeit ca. 2 Wochen" />
                </div>
              </>
            )}

            {type === "verkaufsschild" && (
              <>
                <div>
                  <Label>Preis (EUR)</Label>
                  <Input value={signPrice} onChange={(e) => setSignPrice(e.target.value)} placeholder="z.B. 48900" />
                </div>
                <div>
                  <Label>Highlights / Kurzausstattung</Label>
                  <Textarea rows={2} value={signHighlights} onChange={(e) => setSignHighlights(e.target.value)} />
                </div>
                <div>
                  <Label>Fußzeile</Label>
                  <Input value={signFootline} onChange={(e) => setSignFootline(e.target.value)} />
                </div>
              </>
            )}

            {type === "finanzierungsangebot" && (
              <>
                <div>
                  <Label>Monatsrate (EUR)</Label>
                  <Input value={finRate} onChange={(e) => setFinRate(e.target.value)} placeholder={String(suggestedRate || 0)} inputMode="numeric" />
                  {suggestedRate > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Vorschlag: {suggestedRate} € (Fahrzeugpreis ÷ 96)</p>
                  )}
                </div>
                <div>
                  <Label>Disclaimer</Label>
                  <Textarea rows={2} value={finDisclaimer} onChange={(e) => setFinDisclaimer(e.target.value)} />
                </div>
                <div>
                  <Label>Fußzeile</Label>
                  <Input value={finFootline} onChange={(e) => setFinFootline(e.target.value)} />
                </div>
              </>
            )}

            {!company.company_name && (
              <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded p-3">
                Hinweis: Firmendaten sind noch nicht hinterlegt. Bitte zuerst in den Einstellungen eintragen.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
            <Button variant="outline" onClick={handlePreview} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
              Vorschau
            </Button>
            <Button onClick={handleSave} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
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
          title={titles[type]}
          filename={previewFilename}
        />
      )}
    </>
  );
}
