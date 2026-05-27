import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Edit, Trash2, FileText, Loader2, Car as CarIcon } from "lucide-react";
import { STATUS_LABELS, FUEL_LABELS, TRANSMISSION_LABELS, statusBadgeClass, formatNumber, formatPrice, type VehicleStatus } from "@/lib/vehicles";
import { generatePriceTag, generateInvoice, generateContract, generateFinancingPoster, generateOffer, type VehicleForPdf, type CompanyData, type OfferPosition } from "@/lib/pdf";
import { VehicleDocuments } from "@/components/VehicleDocuments";
import { VehicleGallery } from "@/components/VehicleGallery";
import { VehicleTechDetails } from "@/components/VehicleTechDetails";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { Printer } from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "sonner";

function parseGermanNumber(s: string): number {
  // "22.880" / "22.880,50" / "22880" / "22,880.50" → number; strip currency, spaces
  const cleaned = s.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned) return NaN;
  // If both . and , present: assume German "." = thousands, "," = decimal
  if (cleaned.includes(",") && cleaned.includes(".")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }
  // Only comma → decimal separator
  if (cleaned.includes(",")) return Number(cleaned.replace(",", "."));
  // Only dot(s): if more than one dot OR groups of 3 → thousands separator
  if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    const allGroups3 = parts.slice(1).every(p => p.length === 3);
    if (parts.length > 2 || (parts.length === 2 && allGroups3)) {
      return Number(cleaned.replace(/\./g, ""));
    }
  }
  return Number(cleaned);
}

export const Route = createFileRoute("/fahrzeuge/$id/")({
  component: () => {
    const { id } = Route.useParams();
    return <AppLayout><VehicleDetailPage id={id} /></AppLayout>;
  },
});

function VehicleDetailPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<any>(null);
  const [images, setImages] = useState<{ url: string }[]>([]);
  const [company, setCompany] = useState<CompanyData>({});
  const [loading, setLoading] = useState(true);
  const [docDialog, setDocDialog] = useState<null | "preisschild" | "kaufvertrag" | "rechnung" | "finanzierung" | "angebot">(null);

  useEffect(() => { reload(); }, [id]);

  const reload = async () => {
    const [vRes, iRes, cRes] = await Promise.all([
      supabase.from("vehicles").select("*").eq("id", id).single(),
      supabase.from("vehicle_images").select("url").eq("vehicle_id", id).order("position"),
      supabase.from("company_settings").select("*").eq("kind", "auto").maybeSingle(),
    ]);
    setVehicle(vRes.data);
    setImages(iRes.data ?? []);
    setCompany((cRes.data as CompanyData) ?? {});
    setLoading(false);
  };

  const updateStatus = async (s: VehicleStatus) => {
    await supabase.from("vehicles").update({ status: s }).eq("id", id);
    setVehicle({ ...vehicle, status: s });
    toast.success("Status aktualisiert");
  };

  const deleteVehicle = async () => {
    if (!confirm("Fahrzeug wirklich löschen?")) return;
    await supabase.from("vehicles").delete().eq("id", id);
    toast.success("Gelöscht");
    navigate({ to: "/" });
  };

  if (loading) return <div className="p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!vehicle) return <div className="p-10">Fahrzeug nicht gefunden.</div>;

  const allImages = vehicle.main_image_url ? [{ url: vehicle.main_image_url }, ...images.filter(i => i.url !== vehicle.main_image_url)] : images;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className={cn("text-xs px-2 py-0.5 rounded border", statusBadgeClass(vehicle.status))}>
              {STATUS_LABELS[vehicle.status as VehicleStatus]}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{vehicle.brand} {vehicle.model}</h1>
          <div className="text-2xl font-semibold mt-2 text-accent">{formatPrice(vehicle.price)}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={vehicle.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild><Link to="/fahrzeuge/$id/bearbeiten" params={{ id }}><Edit className="h-4 w-4 mr-1" /> Bearbeiten</Link></Button>
          <Button variant="outline" onClick={deleteVehicle}><Trash2 className="h-4 w-4 mr-1" /> Löschen</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">

          <Card className="p-6">
            <VehicleGallery vehicleId={id} mainImageUrl={vehicle.main_image_url} />
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold mb-4">Technische Daten</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Spec label="Baujahr" value={vehicle.year} />
              <Spec label="Erstzulassung" value={vehicle.first_registration} />
              <Spec label="Kilometer" value={vehicle.mileage != null ? `${formatNumber(vehicle.mileage)} km` : null} />
              <Spec label="Kraftstoff" value={vehicle.fuel ? FUEL_LABELS[vehicle.fuel as keyof typeof FUEL_LABELS] : null} />
              <Spec label="Getriebe" value={vehicle.transmission ? TRANSMISSION_LABELS[vehicle.transmission as keyof typeof TRANSMISSION_LABELS] : null} />
              <Spec label="Leistung" value={vehicle.power_hp ? `${vehicle.power_hp} PS / ${vehicle.power_kw ?? "—"} kW` : null} />
              <Spec label="Hubraum" value={vehicle.displacement_cc ? `${vehicle.displacement_cc} cm³` : null} />
              <Spec label="Farbe" value={vehicle.color} />
              <Spec label="Türen / Sitze" value={`${vehicle.doors ?? "—"} / ${vehicle.seats ?? "—"}`} />
              <Spec label="VIN" value={vehicle.vin} className="col-span-2 md:col-span-3" />
            </div>
          </Card>

          {vehicle.features && vehicle.features.length > 0 && (
            <Card className="p-6">
              <h2 className="font-semibold mb-4">Ausstattung</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {vehicle.features.map((f: string, i: number) => <div key={i}>• {f}</div>)}
              </div>
            </Card>
          )}

          {vehicle.notes && (
            <Card className="p-6">
              <h2 className="font-semibold mb-2">Interne Notizen</h2>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{vehicle.notes}</p>
            </Card>
          )}

          <VehicleTechDetails vehicle={vehicle} onUpdated={reload} />
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4" /> Dokumente</h2>
            <p className="text-sm text-muted-foreground mb-4">Erzeuge PDF-Dokumente für dieses Fahrzeug.</p>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={() => setDocDialog("preisschild")}>
                Preisschild (Aushang)
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setDocDialog("kaufvertrag")}>
                Kaufvertrag
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setDocDialog("rechnung")}>
                Rechnung
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setDocDialog("angebot")}>
                Angebot (Zubehör/Anbauten)
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => setDocDialog("finanzierung")}>
                Finanzierung (Aushang)
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <VehicleDocuments vehicleId={id} />
          </Card>
        </div>
      </div>

      {docDialog && (
        <DocumentDialog
          type={docDialog}
          vehicle={vehicle as VehicleForPdf}
          company={company}
          onClose={() => setDocDialog(null)}
        />
      )}
    </div>
  );
}

function Spec({ label, value, className }: { label: string; value: any; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-medium mt-0.5">{value || "—"}</div>
    </div>
  );
}

function DocumentDialog({ type, vehicle, company, onClose }: {
  type: "preisschild" | "kaufvertrag" | "rechnung" | "finanzierung" | "angebot";
  vehicle: VehicleForPdf; company: CompanyData; onClose: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [printBlob, setPrintBlob] = useState<Blob | null>(null);
  const [printFilename, setPrintFilename] = useState<string>("dokument.pdf");
  const [buyerName, setBuyerName] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerIdNumber, setBuyerIdNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [place, setPlace] = useState(company.address_city ?? "");
  const [vatRate, setVatRate] = useState("19");
  const [diff, setDiff] = useState(false);

  // Preisschild-Felder
  const [huAu, setHuAu] = useState("");
  const [emissionClass, setEmissionClass] = useState("");
  const [shortFeatures, setShortFeatures] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [tagNumber, setTagNumber] = useState("");
  const [vatDeductible, setVatDeductible] = useState(false);
  const [tagPrice, setTagPrice] = useState<string>(vehicle.price != null ? String(vehicle.price) : "");

  // Finanzierungs-Aushang
  const suggestedRate = vehicle.price ? Math.max(1, Math.round(vehicle.price / 96)) : 0;
  const [finRate, setFinRate] = useState<string>(suggestedRate ? String(suggestedRate) : "");
  const [finDisclaimer, setFinDisclaimer] = useState<string>("Das Ratenbeispiel bezieht sich auf das Finanzierungsangebot der Santander Consumer Bank");
  const [finFootline, setFinFootline] = useState<string>("0% ANZAHLEN  FLEXIBLE FINANZIEREN");
  const [validUntil, setValidUntil] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10); });
  const [offerPositions, setOfferPositions] = useState<OfferPosition[]>([{ description: "", quantity: 1, unitPrice: 0 }]);
  const [offerNotes, setOfferNotes] = useState<string>("");
  const scanQrFromPdf = async (file: File): Promise<string | null> => {
    try {
      const pdfjs: any = await import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.mjs");
      const workerUrl: string = (await import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const jsQR = (await import("jsqr")).default;
      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buf }).promise;
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 3 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        // Try full image, then quadrants (QR usually small in a corner)
        const tries: Array<[number, number, number, number]> = [
          [0, 0, canvas.width, canvas.height],
          [0, 0, canvas.width / 2, canvas.height / 2],
          [canvas.width / 2, 0, canvas.width / 2, canvas.height / 2],
          [0, canvas.height / 2, canvas.width / 2, canvas.height / 2],
          [canvas.width / 2, canvas.height / 2, canvas.width / 2, canvas.height / 2],
        ];
        for (const [x, y, w, h] of tries) {
          const img = ctx.getImageData(x, y, w, h);
          const code = jsQR(img.data, img.width, img.height);
          if (code?.data && /^https?:\/\//i.test(code.data)) return code.data;
        }
      }
    } catch (e) {
      console.warn("QR scan failed", e);
    }
    return null;
  };

  const extractFromMobilePdf = async (file: File) => {
    if (file.type !== "application/pdf") { toast.error("Bitte eine PDF-Datei wählen"); return; }
    setExtracting(true);
    try {
      // Rasterize PDF client-side to small JPEGs (avoids 30MB AI input limit).
      const { rasterizePdfToJpegs } = await import("@/lib/pdf-rasterize");
      const [images, qrFromPdf] = await Promise.all([
        rasterizePdfToJpegs(file, { maxPages: 4, scale: 1.5, quality: 0.7 }),
        scanQrFromPdf(file),
      ]);
      const { data: result, error } = await supabase.functions.invoke("extract-vehicle-pdf", {
        body: { images },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      const ex = result?.data ?? {};
      if (ex.hu_au) setHuAu(ex.hu_au);
      if (ex.emission_class) setEmissionClass(ex.emission_class);
      if (ex.short_features) setShortFeatures(ex.short_features);
      if (ex.tag_number) setTagNumber(String(ex.tag_number));
      // Prefer the QR-decoded URL (this is the actual mobile.de inserat link)
      const finalUrl = qrFromPdf || (ex.mobile_url ? String(ex.mobile_url) : "");
      if (finalUrl) setQrUrl(finalUrl);
      if (typeof ex.vat_deductible === "boolean") setVatDeductible(ex.vat_deductible);
      const priceParsed = ex.price != null && !Number.isNaN(Number(ex.price)) ? Number(ex.price) : null;
      if (priceParsed != null) setTagPrice(String(priceParsed));
      toast.success(qrFromPdf ? "Daten + QR-Link aus PDF übernommen" : "Daten aus PDF übernommen");
    } catch (err: any) {
      toast.error(err.message ?? "PDF konnte nicht gelesen werden");
    } finally {
      setExtracting(false);
    }
  };

  const buildDoc = async () => {
    let doc;
    let invoiceNumber: string | null = null;

    if (type === "preisschild") {
      const priceNum = tagPrice.trim()
        ? parseGermanNumber(tagPrice)
        : vehicle.price;
      const finalPrice = Number.isFinite(priceNum as number) ? (priceNum as number) : vehicle.price;
      if (finalPrice != null && finalPrice !== vehicle.price) {
        await supabase.from("vehicles").update({ price: finalPrice }).eq("id", vehicle.id);
      }
      const vForTag = { ...vehicle, price: finalPrice };
      doc = await generatePriceTag(vForTag, company, {
        hu_au: huAu || null,
        emission_class: emissionClass || null,
        short_features: shortFeatures || null,
        vat_deductible: vatDeductible,
        qr_url: qrUrl || null,
        number: tagNumber || null,
        description: vehicle.notes || null,
      });
    } else if (type === "rechnung") {
      const { data: cs } = await supabase.from("company_settings").select("id, invoice_counter").eq("kind", "auto").maybeSingle();
      if (cs) {
        invoiceNumber = `RE-${new Date().getFullYear()}-${String(cs.invoice_counter + 1).padStart(4, "0")}`;
        await supabase.from("company_settings").update({ invoice_counter: cs.invoice_counter + 1 }).eq("id", cs.id);
      } else {
        invoiceNumber = `RE-${new Date().getFullYear()}-0001`;
      }
      doc = await generateInvoice(vehicle, company, {
        buyerName, buyerAddress, invoiceNumber, date,
        vatRate: diff ? 0 : parseFloat(vatRate || "0"), isInvoice: true,
      });
    } else if (type === "finanzierung") {
      const rateNum = parseGermanNumber(finRate);
      if (!Number.isFinite(rateNum) || rateNum <= 0) throw new Error("Bitte eine gültige Monatsrate eingeben.");
      doc = await generateFinancingPoster({
        monthlyRate: rateNum,
        disclaimer: finDisclaimer || undefined,
        footline: finFootline || undefined,
      });
    } else if (type === "angebot") {
      const { data: cs } = await supabase.from("company_settings").select("id, offer_counter").eq("kind", "auto").maybeSingle() as any;
      let offerNumber: string;
      if (cs && typeof cs.offer_counter === "number") {
        offerNumber = `AN-${new Date().getFullYear()}-${String(cs.offer_counter + 1).padStart(4, "0")}`;
        await supabase.from("company_settings").update({ offer_counter: cs.offer_counter + 1 } as any).eq("id", cs.id);
      } else {
        offerNumber = `AN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      }
      const cleanPositions = offerPositions.filter(p => p.description.trim() !== "");
      if (cleanPositions.length === 0) throw new Error("Bitte mindestens eine Position erfassen.");
      doc = await generateOffer(vehicle, company, {
        offerNumber, date, validUntil: validUntil || undefined,
        customerName: buyerName || undefined, customerAddress: buyerAddress || undefined,
        positions: cleanPositions, vatRate: diff ? 0 : parseFloat(vatRate || "0"),
        notes: offerNotes || undefined,
      });
    } else {
      doc = await generateContract(vehicle, company, { buyerName, buyerAddress, buyerIdNumber, date, place });
    }
    const filename = `${type}-${vehicle.brand}-${vehicle.model}-${date}.pdf`.replace(/\s+/g, "_");
    return { doc, filename };
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { doc, filename } = await buildDoc();
      doc.save(filename);
      toast.success("Dokument erstellt");
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "Fehler beim Erstellen");
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = async () => {
    setGenerating(true);
    try {
      const { doc, filename } = await buildDoc();
      const blob: Blob = doc.output("blob");
      setPrintFilename(filename);
      setPrintBlob(blob);
    } catch (err: any) {
      toast.error(err.message ?? "Fehler beim Erstellen");
    } finally {
      setGenerating(false);
    }
  };

  const titles = { preisschild: "Preisschild erstellen", kaufvertrag: "Kaufvertrag erstellen", rechnung: "Rechnung erstellen", finanzierung: "Finanzierungs-Aushang erstellen", angebot: "Angebot erstellen" };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !printBlob) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{titles[type]}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {type === "preisschild" && (
            <>
              <div className="rounded-md border-2 border-dashed p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-sm">
                    <div className="font-medium">mobile.de PDF importieren (optional)</div>
                    <div className="text-xs text-muted-foreground">HU/AU, Schadstoffklasse, Kurzausstattung werden vorbefüllt</div>
                  </div>
                  <label>
                    <input type="file" accept="application/pdf" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) extractFromMobilePdf(f); e.target.value = ""; }} />
                    <Button type="button" variant="outline" size="sm" disabled={extracting} asChild>
                      <span>{extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : "PDF auswählen"}</span>
                    </Button>
                  </label>
                </div>
              </div>
              {extracting && (
                <div className="rounded-md border bg-muted/40 p-3 text-xs flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  PDF wird ausgelesen…
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>HU/AU</Label><Input value={huAu} onChange={e => setHuAu(e.target.value)} placeholder="z.B. NEU oder 06/2026" /></div>
                <div><Label>Schadstoffklasse</Label><Input value={emissionClass} onChange={e => setEmissionClass(e.target.value)} placeholder="z.B. Euro 6d-TEMP" /></div>
              </div>
              <div><Label>Preis (EUR)</Label><Input value={tagPrice} onChange={e => setTagPrice(e.target.value)} placeholder="22880" /></div>
              <div><Label>Kurzausstattung (Schlagzeile)</Label><Input value={shortFeatures} onChange={e => setShortFeatures(e.target.value)} placeholder="Automatik Leder Navi PDC !!!" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>QR-Code Ziel-URL</Label><Input value={qrUrl} onChange={e => setQrUrl(e.target.value)} placeholder={company.website ?? "https://…"} /></div>
                <div><Label>Nr. (optional)</Label><Input value={tagNumber} onChange={e => setTagNumber(e.target.value)} placeholder="15" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={vatDeductible} onChange={e => setVatDeductible(e.target.checked)} />
                MwSt. ausweisbar (sonst „MwSt. nicht ausweisbar")
              </label>
            </>
          )}

          {(type === "kaufvertrag" || type === "rechnung") && (
            <>
              <div>
                <Label>Käufer-Name</Label>
                <Input value={buyerName} onChange={e => setBuyerName(e.target.value)} />
              </div>
              <div>
                <Label>Käufer-Anschrift</Label>
                <Textarea rows={3} value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="Straße&#10;PLZ Ort" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Datum</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                {type === "kaufvertrag" && (
                  <div>
                    <Label>Ort</Label>
                    <Input value={place} onChange={e => setPlace(e.target.value)} />
                  </div>
                )}
              </div>
              {type === "kaufvertrag" && (
                <div>
                  <Label>Ausweis-Nr. (optional)</Label>
                  <Input value={buyerIdNumber} onChange={e => setBuyerIdNumber(e.target.value)} />
                </div>
              )}
              {type === "rechnung" && (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label>MwSt.-Satz (%)</Label>
                    <Input type="number" value={vatRate} onChange={e => setVatRate(e.target.value)} disabled={diff} />
                  </div>
                  <label className="flex items-center gap-2 text-sm h-10">
                    <input type="checkbox" checked={diff} onChange={e => setDiff(e.target.checked)} />
                    Differenzbesteuerung (§ 25a UStG)
                  </label>
                </div>
              )}
            </>
          )}

          {type === "finanzierung" && (
            <>
              <div>
                <Label>Monatsrate (EUR)</Label>
                <Input value={finRate} onChange={e => setFinRate(e.target.value)} placeholder={String(suggestedRate || 0)} inputMode="numeric" />
                {suggestedRate > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Vorschlag: {suggestedRate} € (Fahrzeugpreis ÷ 96)</p>
                )}
              </div>
              <div>
                <Label>Disclaimer (Sternchentext)</Label>
                <Textarea rows={2} value={finDisclaimer} onChange={e => setFinDisclaimer(e.target.value)} />
              </div>
              <div>
                <Label>Fußzeile (rote Schlagzeile)</Label>
                <Input value={finFootline} onChange={e => setFinFootline(e.target.value)} />
              </div>

              {/* Live-Vorschau via SVG (exakt 297×210 mm) */}
              <div>
                <Label>Vorschau</Label>
                <div className="mt-1 rounded border bg-white shadow-sm overflow-hidden">
                  <svg viewBox="0 0 297 210" className="block w-full h-auto" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
                    <text x="148.5" y="40" textAnchor="middle" fontWeight="700" fontSize="30" fill="#000">monatlich</text>
                    <rect x="12" y="50" width="273" height="116" rx="10" ry="10" fill="rgb(227,30,36)" />
                    {(() => {
                      const label = `nur ${parseGermanNumber(finRate) || 0}€`;
                      // Boxbreite ~261mm innen, Helvetica-Bold ≈ 0.58em pro Zeichen
                      const fontSize = Math.min(80, Math.floor(261 / (label.length * 0.58)));
                      // Box: y=50..166 → optisches Zentrum y=108. Mit alphabetic-Baseline:
                      // y = center + fontSize * 0.35 (kompensiert Cap-Height/Descender)
                      const baselineY = 108 + fontSize * 0.35;
                      return (
                        <text x="148.5" y={baselineY} textAnchor="middle" fontWeight="700" fontSize={fontSize} fill="#fff">
                          {label}
                        </text>
                      );
                    })()}
                    <text x="148.5" y="175" textAnchor="middle" fontWeight="700" fontSize="4.2" fill="#000">
                      *  {finDisclaimer}
                    </text>
                    <text x="148.5" y="198" textAnchor="middle" fontWeight="700" fontSize="14" fill="rgb(227,30,36)">
                      {finFootline}
                    </text>
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Maßstabsgetreue Vorschau (A4 quer).</p>
              </div>
            </>
          )}

          {type === "angebot" && (
            <>
              <div>
                <Label>Kunde (optional)</Label>
                <Input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Name" />
              </div>
              <div>
                <Label>Kunden-Anschrift (optional)</Label>
                <Textarea rows={2} value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="Straße&#10;PLZ Ort" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Datum</Label>
                  <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
                </div>
                <div>
                  <Label>Gültig bis</Label>
                  <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
                </div>
                <div>
                  <Label>MwSt. (%)</Label>
                  <Input type="number" value={vatRate} onChange={e => setVatRate(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Positionen (Anhängerkupplung, Anbauten, …)</Label>
                <div className="space-y-2 mt-1">
                  {offerPositions.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_70px_110px_auto] gap-2 items-center">
                      <Input placeholder="Beschreibung" value={p.description}
                        onChange={e => setOfferPositions(prev => prev.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))} />
                      <Input type="number" min="0" step="1" placeholder="Menge" value={p.quantity}
                        onChange={e => setOfferPositions(prev => prev.map((x, idx) => idx === i ? { ...x, quantity: Number(e.target.value) || 0 } : x))} />
                      <Input type="number" min="0" step="0.01" placeholder="Preis €" value={p.unitPrice}
                        onChange={e => setOfferPositions(prev => prev.map((x, idx) => idx === i ? { ...x, unitPrice: Number(e.target.value) || 0 } : x))} />
                      <Button type="button" variant="ghost" size="icon"
                        onClick={() => setOfferPositions(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setOfferPositions(prev => [...prev, { description: "", quantity: 1, unitPrice: 0 }])}>
                    + Position
                  </Button>
                </div>
              </div>
              <div>
                <Label>Hinweise (optional)</Label>
                <Textarea rows={2} value={offerNotes} onChange={e => setOfferNotes(e.target.value)} />
              </div>
            </>
          )}



          {!company.company_name && (
            <div className="text-xs text-warning bg-warning/10 border border-warning/30 rounded p-3">
              Hinweis: Firmendaten sind noch nicht hinterlegt. <Link to="/einstellungen" className="underline">Jetzt eintragen</Link>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button variant="outline" onClick={handlePrint} disabled={generating || extracting}>
            <Printer className="h-4 w-4 mr-1" />
            {generating ? "…" : "Drucken"}
          </Button>
          <Button onClick={handleGenerate} disabled={generating || extracting}>
            {generating ? "Erstellt…" : extracting ? "Bitte warten…" : "PDF erstellen"}
          </Button>
        </DialogFooter>
      </DialogContent>
      {printBlob && (
        <PrintPreviewDialog
          open
          onClose={() => { setPrintBlob(null); onClose(); }}
          source={printBlob}
          title={titles[type]}
          filename={printFilename}
        />
      )}
    </Dialog>
  );
}
