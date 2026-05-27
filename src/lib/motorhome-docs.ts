import jsPDF from "jspdf";
import { FUEL_LABELS, TRANSMISSION_LABELS, formatNumber, formatPrice } from "./vehicles";
import { BODY_TYPE_LABELS, type MotorhomeBodyType } from "./motorhomes";
import { generateFinancingPoster, type CompanyData } from "./pdf";

export type { CompanyData };

export interface MotorhomeForPdf {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  mileage: number | null;
  price: number | null;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  fuel: string | null;
  transmission: string | null;
  power_hp: number | null;
  power_kw: number | null;
  displacement_cc: number | null;
  body_type: MotorhomeBodyType | null;
  sitting_places: number | null;
  sleeping_places: number | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  gross_weight_kg: number | null;
  features: string[];
  first_registration: string | null;
  main_image_url: string | null;
  notes?: string | null;
}

async function loadImage(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = data;
    });
    return { data, w: img.width, h: img.height };
  } catch {
    return null;
  }
}

async function drawCompanyHeader(doc: jsPDF, c: CompanyData, W: number, M: number) {
  let headerH = 0;
  if (c.logo_url) {
    const img = await loadImage(c.logo_url);
    if (img) {
      const h = 18;
      const w = img.w * (h / img.h);
      doc.addImage(img.data, "PNG", M, M, w, h);
      headerH = h;
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(c.company_name || "", W - M, M + 4, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  const right = [
    c.address_street,
    `${c.address_zip ?? ""} ${c.address_city ?? ""}`.trim(),
    c.phone,
    c.email,
    c.website,
  ].filter(Boolean) as string[];
  right.forEach((l, i) => doc.text(l, W - M, M + 9 + i * 4, { align: "right" }));
  doc.setTextColor(0);
  return M + Math.max(headerH, right.length * 4 + 9) + 10;
}

function drawFooter(doc: jsPDF, c: CompanyData, W: number, M: number) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  const lines = [
    c.vat_id ? `USt-IdNr.: ${c.vat_id}` : null,
    c.tax_number ? `Steuernr.: ${c.tax_number}` : null,
    c.bank_name && c.bank_iban
      ? `Bank: ${c.bank_name} · IBAN ${c.bank_iban}${c.bank_bic ? ` · BIC ${c.bank_bic}` : ""}`
      : null,
  ].filter(Boolean) as string[];
  lines.forEach((l, i) => doc.text(l, M, 285 - (lines.length - i) * 4));
  doc.setTextColor(0);
}

function motorhomeFacts(v: MotorhomeForPdf): [string, string][] {
  return [
    ["Marke / Modell", `${v.brand} ${v.model}`],
    ["Bauart", v.body_type ? BODY_TYPE_LABELS[v.body_type] : "—"],
    ["Erstzulassung", v.first_registration ?? (v.year?.toString() ?? "—")],
    ["Kennzeichen", v.license_plate ?? "—"],
    ["Kilometerstand", v.mileage != null ? `${formatNumber(v.mileage)} km` : "—"],
    ["Fahrzeug-Ident-Nr. (VIN)", v.vin ?? "—"],
    ["Farbe", v.color ?? "—"],
    ["Kraftstoff", v.fuel ? FUEL_LABELS[v.fuel as keyof typeof FUEL_LABELS] : "—"],
    ["Getriebe", v.transmission ? TRANSMISSION_LABELS[v.transmission as keyof typeof TRANSMISSION_LABELS] : "—"],
    ["Leistung", v.power_hp ? `${v.power_hp} PS${v.power_kw ? ` / ${v.power_kw} kW` : ""}` : "—"],
    ["Hubraum", v.displacement_cc ? `${formatNumber(v.displacement_cc)} cm³` : "—"],
    ["zul. Gesamtgewicht", v.gross_weight_kg ? `${formatNumber(v.gross_weight_kg)} kg` : "—"],
    ["Sitzplätze / Schlafplätze", `${v.sitting_places ?? "—"} / ${v.sleeping_places ?? "—"}`],
    [
      "Abmessungen (L × B × H)",
      [v.length_mm, v.width_mm, v.height_mm].every((x) => x != null)
        ? `${v.length_mm} × ${v.width_mm} × ${v.height_mm} mm`
        : "—",
    ],
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Verkaufsrechnung
// ─────────────────────────────────────────────────────────────────────────────
export interface InvoiceOpts {
  buyerName: string;
  buyerAddress: string;
  invoiceNumber: string;
  date: string;
  vatRate: number; // 0 = Differenzbesteuerung
  paymentMethod?: string;
}

export async function generateMotorhomeInvoice(
  v: MotorhomeForPdf,
  c: CompanyData,
  opts: InvoiceOpts,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const M = 20;

  let y = await drawCompanyHeader(doc, c, W, M);

  // Buyer + meta side by side
  const buyerY = y;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("RECHNUNG AN", M, y); y += 5;
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.buyerName || "—", M, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  opts.buyerAddress.split("\n").forEach((l) => { doc.text(l, M, y); y += 5; });

  let yMeta = buyerY;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("RECHNUNG", W - M, yMeta, { align: "right" });
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.invoiceNumber, W - M, yMeta + 5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Datum: ${opts.date}`, W - M, yMeta + 10, { align: "right" });

  y = Math.max(y, yMeta + 18) + 10;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Rechnung Wohnmobil", M, y); y += 10;

  // Header row
  doc.setDrawColor(200);
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - 2 * M, 8, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Position", M + 2, y + 5.5);
  doc.text("Betrag", W - M - 2, y + 5.5, { align: "right" });
  y += 10;

  // Vehicle line item
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(`${v.brand} ${v.model}${v.body_type ? ` · ${BODY_TYPE_LABELS[v.body_type]}` : ""}`, M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100);
  const details = [
    v.first_registration ? `EZ ${v.first_registration}` : (v.year ? `Bj. ${v.year}` : null),
    v.mileage != null ? `${formatNumber(v.mileage)} km` : null,
    v.vin ? `VIN: ${v.vin}` : null,
    v.license_plate ? `Kennz.: ${v.license_plate}` : null,
    v.fuel ? FUEL_LABELS[v.fuel as keyof typeof FUEL_LABELS] : null,
  ].filter(Boolean).join(" · ");
  doc.text(details, M, y + 5, { maxWidth: W - 2 * M - 50 });
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(formatPrice(v.price), W - M, y, { align: "right" });
  y += 14;

  doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 6;

  // Totals
  const gross = v.price ?? 0;
  const net = opts.vatRate > 0 ? gross / (1 + opts.vatRate / 100) : gross;
  const vat = gross - net;
  const totalsX = W - M - 60;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  if (opts.vatRate > 0) {
    doc.text("Nettobetrag", totalsX, y);
    doc.text(formatPrice(net), W - M, y, { align: "right" }); y += 6;
    doc.text(`MwSt. ${opts.vatRate}%`, totalsX, y);
    doc.text(formatPrice(vat), W - M, y, { align: "right" }); y += 6;
  } else {
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text("Differenzbesteuerung gem. § 25a UStG. MwSt. nicht ausweisbar.", M, y);
    doc.setTextColor(0); doc.setFontSize(10); y += 6;
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Gesamtbetrag", totalsX, y);
  doc.text(formatPrice(gross), W - M, y, { align: "right" });
  y += 14;

  if (opts.paymentMethod) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Zahlungsart: ${opts.paymentMethod}`, M, y); y += 6;
  }

  drawFooter(doc, c, W, M);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Verbindliche Bestellung
// ─────────────────────────────────────────────────────────────────────────────
export interface OrderOpts {
  buyerName: string;
  buyerAddress: string;
  orderNumber: string;
  date: string;
  vehiclePrice: number;
  deposit: number;
  deliveryDate: string;
  conditions?: string;
  place?: string;
}

export async function generateMotorhomeOrder(
  v: MotorhomeForPdf,
  c: CompanyData,
  opts: OrderOpts,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 20;

  let y = await drawCompanyHeader(doc, c, W, M);

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("BESTELLUNG", W - M, y - 26, { align: "right" });
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.orderNumber, W - M, y - 21, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Datum: ${opts.date}`, W - M, y - 16, { align: "right" });

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Verbindliche Bestellung", M, y); y += 10;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Hiermit bestelle ich verbindlich folgendes Wohnmobil:", M, y, { maxWidth: W - 2 * M });
  y += 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("Käufer", M, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(opts.buyerName || "—", M, y); y += 5;
  opts.buyerAddress.split("\n").forEach((l) => { doc.text(l, M, y); y += 5; });
  y += 4;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Bestelltes Fahrzeug", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  motorhomeFacts(v).forEach(([k, val]) => {
    doc.setTextColor(120); doc.text(k, M, y);
    doc.setTextColor(0); doc.text(val, M + 70, y, { maxWidth: W - 2 * M - 70 });
    y += 5;
  });

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Konditionen", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const rest = Math.max(0, opts.vehiclePrice - opts.deposit);
  const condRows: [string, string][] = [
    ["Kaufpreis", formatPrice(opts.vehiclePrice)],
    ["Anzahlung", formatPrice(opts.deposit)],
    ["Restbetrag bei Übergabe", formatPrice(rest)],
    ["Voraussichtliches Lieferdatum", opts.deliveryDate || "—"],
  ];
  condRows.forEach(([k, val]) => {
    doc.setTextColor(120); doc.text(k, M, y);
    doc.setTextColor(0); doc.text(val, M + 70, y);
    y += 5;
  });

  if (opts.conditions) {
    y += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Bemerkungen", M, y); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(opts.conditions, M, y, { maxWidth: W - 2 * M });
    y += Math.max(6, Math.ceil(opts.conditions.length / 90) * 5);
  }

  y += 8;
  if (y > H - 50) { doc.addPage(); y = M; }
  doc.setFontSize(10);
  doc.text(`${opts.place || c.address_city || "…………………"}, den ${opts.date}`, M, y);
  y += 20;

  const colW = (W - 2 * M - 10) / 2;
  doc.setDrawColor(0);
  doc.line(M, y, M + colW, y);
  doc.line(M + colW + 10, y, W - M, y);
  doc.setFontSize(9); doc.setTextColor(100);
  doc.text("Verkäufer", M, y + 5);
  doc.text("Käufer", M + colW + 10, y + 5);
  doc.setTextColor(0);

  drawFooter(doc, c, W, M);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Dichtigkeitsprüfung
// ─────────────────────────────────────────────────────────────────────────────
export type LeakResult = "bestanden" | "mit_maengeln" | "nicht_bestanden";
export const LEAK_RESULT_LABELS: Record<LeakResult, string> = {
  bestanden: "bestanden — keine Feuchtigkeit festgestellt",
  mit_maengeln: "bestanden mit Mängeln",
  nicht_bestanden: "nicht bestanden",
};

export interface LeakTestOpts {
  testDate: string;
  inspector: string;
  workshop?: string;
  result: LeakResult;
  measurements?: string;
  nextTestDate?: string;
  notes?: string;
}

export async function generateLeakTest(
  v: MotorhomeForPdf,
  c: CompanyData,
  opts: LeakTestOpts,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 20;

  let y = await drawCompanyHeader(doc, c, W, M);

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Protokoll Dichtigkeitsprüfung", M, y); y += 10;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Inspektion des Aufbaus auf Wassereintritt gemäß Herstellervorgaben.", M, y, { maxWidth: W - 2 * M });
  y += 10;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Fahrzeug", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  motorhomeFacts(v).forEach(([k, val]) => {
    doc.setTextColor(120); doc.text(k, M, y);
    doc.setTextColor(0); doc.text(val, M + 70, y, { maxWidth: W - 2 * M - 70 });
    y += 5;
  });

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Prüfung", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const rows: [string, string][] = [
    ["Prüfdatum", opts.testDate],
    ["Prüfer", opts.inspector || "—"],
    ["Werkstatt", opts.workshop || "—"],
    ["Ergebnis", LEAK_RESULT_LABELS[opts.result]],
    ["Nächste Prüfung", opts.nextTestDate || "—"],
  ];
  rows.forEach(([k, val]) => {
    doc.setTextColor(120); doc.text(k, M, y);
    doc.setTextColor(0); doc.text(val, M + 70, y, { maxWidth: W - 2 * M - 70 });
    y += 5;
  });

  if (opts.measurements) {
    y += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Messwerte", M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    opts.measurements.split("\n").forEach((l) => { doc.text(l, M, y); y += 5; });
  }

  if (opts.notes) {
    y += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Bemerkungen", M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(opts.notes, M, y, { maxWidth: W - 2 * M });
    y += Math.max(6, Math.ceil(opts.notes.length / 90) * 5);
  }

  y += 16;
  const colW = (W - 2 * M - 10) / 2;
  doc.setDrawColor(0);
  doc.line(M, y, M + colW, y);
  doc.line(M + colW + 10, y, W - M, y);
  doc.setFontSize(9); doc.setTextColor(100);
  doc.text("Prüfer", M, y + 5);
  doc.text("Fahrzeughalter", M + colW + 10, y + 5);
  doc.setTextColor(0);

  drawFooter(doc, c, W, M);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Werkstattrechnung
// ─────────────────────────────────────────────────────────────────────────────
export interface WorkshopPosition {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface WorkshopOpts {
  invoiceNumber: string;
  date: string;
  workshop: string;
  customerName?: string;
  customerAddress?: string;
  positions: WorkshopPosition[];
  vatRate: number;
  notes?: string;
}

export async function generateWorkshopInvoice(
  v: MotorhomeForPdf,
  c: CompanyData,
  opts: WorkshopOpts,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 20;

  let y = await drawCompanyHeader(doc, c, W, M);

  const buyerY = y;
  if (opts.customerName) {
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text("RECHNUNG AN", M, y); y += 5;
    doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
    doc.text(opts.customerName, M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    (opts.customerAddress ?? "").split("\n").filter(Boolean).forEach((l) => { doc.text(l, M, y); y += 5; });
  }
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("WERKSTATTRECHNUNG", W - M, buyerY, { align: "right" });
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.invoiceNumber, W - M, buyerY + 5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Datum: ${opts.date}`, W - M, buyerY + 10, { align: "right" });
  if (opts.workshop) doc.text(opts.workshop, W - M, buyerY + 15, { align: "right" });

  y = Math.max(y, buyerY + 20) + 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Fahrzeug", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const vehInline = [
    `${v.brand} ${v.model}`,
    v.license_plate ? `Kennz. ${v.license_plate}` : null,
    v.vin ? `VIN ${v.vin}` : null,
    v.mileage != null ? `${formatNumber(v.mileage)} km` : null,
  ].filter(Boolean).join(" · ");
  doc.text(vehInline, M, y, { maxWidth: W - 2 * M }); y += 8;

  // Positions table
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - 2 * M, 8, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Beschreibung", M + 2, y + 5.5);
  doc.text("Menge", W - M - 60, y + 5.5, { align: "right" });
  doc.text("Einzelpreis", W - M - 30, y + 5.5, { align: "right" });
  doc.text("Gesamt", W - M - 2, y + 5.5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  let net = 0;
  const descMaxW = W - 2 * M - 72;
  const lineH = 5;
  const rowPad = 2;
  opts.positions.forEach((p) => {
    const total = p.quantity * p.unitPrice;
    net += total;
    const lines = doc.splitTextToSize(p.description, descMaxW) as string[];
    lines.forEach((ln, i) => doc.text(ln, M + 2, y + i * lineH));
    doc.text(formatNumber(p.quantity), W - M - 60, y, { align: "right" });
    doc.text(formatPrice(p.unitPrice), W - M - 30, y, { align: "right" });
    doc.text(formatPrice(total), W - M - 2, y, { align: "right" });
    y += Math.max(1, lines.length) * lineH + rowPad;
  });

  doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 6;
  const totalsX = W - M - 60;
  const vat = net * (opts.vatRate / 100);
  const gross = net + vat;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("Nettobetrag", totalsX, y);
  doc.text(formatPrice(net), W - M, y, { align: "right" }); y += 6;
  doc.text(`MwSt. ${opts.vatRate}%`, totalsX, y);
  doc.text(formatPrice(vat), W - M, y, { align: "right" }); y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Gesamtbetrag", totalsX, y);
  doc.text(formatPrice(gross), W - M, y, { align: "right" });
  y += 10;

  if (opts.notes) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text(opts.notes, M, y, { maxWidth: W - 2 * M });
    doc.setTextColor(0);
  }

  drawFooter(doc, c, W, M);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4b. Angebot (gleiche Tabelle wie Werkstattrechnung, andere Optik/Texte)
// ─────────────────────────────────────────────────────────────────────────────
export interface OfferOpts {
  offerNumber: string;
  date: string;
  validUntil?: string;
  customerName?: string;
  customerAddress?: string;
  positions: WorkshopPosition[];
  vatRate: number;
  notes?: string;
}

export async function generateMotorhomeOffer(
  v: MotorhomeForPdf,
  c: CompanyData,
  opts: OfferOpts,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 20;

  let y = await drawCompanyHeader(doc, c, W, M);

  const headerY = y;
  if (opts.customerName) {
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text("ANGEBOT FÜR", M, y); y += 5;
    doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
    doc.text(opts.customerName, M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    (opts.customerAddress ?? "").split("\n").filter(Boolean).forEach((l) => { doc.text(l, M, y); y += 5; });
  }
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("ANGEBOT", W - M, headerY, { align: "right" });
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.offerNumber, W - M, headerY + 5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Datum: ${opts.date}`, W - M, headerY + 10, { align: "right" });
  if (opts.validUntil) doc.text(`Gültig bis: ${opts.validUntil}`, W - M, headerY + 15, { align: "right" });

  y = Math.max(y, headerY + 20) + 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Fahrzeug", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const vehInline = [
    `${v.brand} ${v.model}`,
    v.license_plate ? `Kennz. ${v.license_plate}` : null,
    v.vin ? `VIN ${v.vin}` : null,
    v.mileage != null ? `${formatNumber(v.mileage)} km` : null,
  ].filter(Boolean).join(" · ");
  doc.text(vehInline, M, y, { maxWidth: W - 2 * M }); y += 8;

  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - 2 * M, 8, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Beschreibung", M + 2, y + 5.5);
  doc.text("Menge", W - M - 60, y + 5.5, { align: "right" });
  doc.text("Einzelpreis", W - M - 30, y + 5.5, { align: "right" });
  doc.text("Gesamt", W - M - 2, y + 5.5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  let net = 0;
  const descMaxW = W - 2 * M - 72;
  const lineH = 5, rowPad = 2;
  opts.positions.forEach((p) => {
    const total = p.quantity * p.unitPrice;
    net += total;
    const lines = doc.splitTextToSize(p.description, descMaxW) as string[];
    lines.forEach((ln, i) => doc.text(ln, M + 2, y + i * lineH));
    doc.text(formatNumber(p.quantity), W - M - 60, y, { align: "right" });
    doc.text(formatPrice(p.unitPrice), W - M - 30, y, { align: "right" });
    doc.text(formatPrice(total), W - M - 2, y, { align: "right" });
    y += Math.max(1, lines.length) * lineH + rowPad;
  });

  doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 6;
  const totalsX = W - M - 60;
  const vat = net * (opts.vatRate / 100);
  const gross = net + vat;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("Nettobetrag", totalsX, y);
  doc.text(formatPrice(net), W - M, y, { align: "right" }); y += 6;
  doc.text(`MwSt. ${opts.vatRate}%`, totalsX, y);
  doc.text(formatPrice(vat), W - M, y, { align: "right" }); y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Gesamtsumme", totalsX, y);
  doc.text(formatPrice(gross), W - M, y, { align: "right" });
  y += 10;

  if (opts.notes) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text(opts.notes, M, y, { maxWidth: W - 2 * M });
    doc.setTextColor(0);
    y += 8;
  }

  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Dieses Angebot ist freibleibend.", M, y);
  doc.setTextColor(0); doc.setFont("helvetica", "normal");

  drawFooter(doc, c, W, M);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Verkaufsschild (A4 quer)
// ─────────────────────────────────────────────────────────────────────────────
export interface PriceSignOpts {
  price?: number | null;
  highlights?: string;
  footline?: string;
}

export async function generateMotorhomePriceSign(
  v: MotorhomeForPdf,
  _c: CompanyData,
  opts: PriceSignOpts,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  const W = 297, H = 210;
  const RED: [number, number, number] = [227, 30, 36];
  const M = 12;

  const price = opts.price != null ? opts.price : v.price;
  const highlights = opts.highlights ?? (v.features ?? []).slice(0, 5).join(" · ");
  const footline = opts.footline ?? "WOHNMOBIL-ZENTRUM";

  // Title
  doc.setFont("helvetica", "bold"); doc.setTextColor(0);
  doc.setFontSize(28);
  doc.text(`${v.brand} ${v.model}`, W / 2, M + 14, { align: "center" });
  doc.setFontSize(14); doc.setTextColor(100);
  const subline = [
    v.body_type ? BODY_TYPE_LABELS[v.body_type] : null,
    v.first_registration ? `EZ ${v.first_registration}` : (v.year ? `Bj. ${v.year}` : null),
    v.mileage != null ? `${formatNumber(v.mileage)} km` : null,
    v.power_hp ? `${v.power_hp} PS` : null,
  ].filter(Boolean).join("  ·  ");
  doc.text(subline, W / 2, M + 22, { align: "center" });

  // Red price box
  const boxY = 50;
  const boxH = 90;
  const boxW = W - 2 * M;
  doc.setFillColor(RED[0], RED[1], RED[2]);
  doc.roundedRect(M, boxY, boxW, boxH, 10, 10, "F");

  const priceLabel = price != null ? formatPrice(price) : "Preis auf Anfrage";
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  let pt = 110;
  doc.setFontSize(pt);
  while (pt > 30 && doc.getTextWidth(priceLabel) > boxW - 24) {
    pt -= 2; doc.setFontSize(pt);
  }
  doc.text(priceLabel, W / 2, boxY + boxH / 2, { align: "center", baseline: "middle" });

  // Spec strip below box
  doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  const specs = [
    v.sleeping_places != null ? `${v.sleeping_places} Schlafplätze` : null,
    v.sitting_places != null ? `${v.sitting_places} Sitzplätze` : null,
    v.length_mm ? `Länge ${(v.length_mm / 1000).toFixed(2)} m` : null,
    v.gross_weight_kg ? `${formatNumber(v.gross_weight_kg)} kg zGG` : null,
  ].filter(Boolean).join("   ·   ");
  doc.text(specs, W / 2, boxY + boxH + 10, { align: "center" });

  if (highlights) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    let hpt = 13;
    doc.setFontSize(hpt);
    while (hpt > 8 && doc.getTextWidth(highlights) > W - 2 * M) {
      hpt -= 1; doc.setFontSize(hpt);
    }
    doc.text(highlights, W / 2, boxY + boxH + 22, { align: "center" });
  }

  // Footline
  doc.setTextColor(RED[0], RED[1], RED[2]);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20);
  doc.text(footline, W / 2, H - 12, { align: "center" });

  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Finanzierungsangebot — reuse the existing poster generator
// ─────────────────────────────────────────────────────────────────────────────
export { generateFinancingPoster };

// ─────────────────────────────────────────────────────────────────────────────
// 7. Freie Rechnung (Fremdkunden, optional mit Fahrzeugbezug)
// ─────────────────────────────────────────────────────────────────────────────
export interface FreeInvoiceVehicle {
  brand?: string;
  model?: string;
  vin?: string;
  license_plate?: string;
  first_registration?: string;
  mileage?: number | null;
}

export interface FreeInvoiceOpts {
  invoiceNumber: string;
  date: string;
  title?: string;
  customerName: string;
  customerAddress: string;
  vehicle?: FreeInvoiceVehicle;
  positions: WorkshopPosition[];
  vatRate: number;
  diff?: boolean;
  paymentMethod?: string;
  notes?: string;
}

export async function generateFreeInvoice(
  c: CompanyData,
  opts: FreeInvoiceOpts,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 20;

  let y = await drawCompanyHeader(doc, c, W, M);

  const headerY = y;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("RECHNUNG AN", M, y); y += 5;
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.customerName || "—", M, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  (opts.customerAddress ?? "").split("\n").filter(Boolean).forEach((l) => { doc.text(l, M, y); y += 5; });

  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("RECHNUNG", W - M, headerY, { align: "right" });
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.invoiceNumber, W - M, headerY + 5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Datum: ${opts.date}`, W - M, headerY + 10, { align: "right" });

  y = Math.max(y, headerY + 18) + 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(opts.title || "Rechnung", M, y); y += 10;

  if (opts.vehicle && (opts.vehicle.brand || opts.vehicle.vin || opts.vehicle.license_plate)) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("Fahrzeug", M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const v = opts.vehicle;
    const inline = [
      [v.brand, v.model].filter(Boolean).join(" "),
      v.first_registration ? `EZ ${v.first_registration}` : null,
      v.license_plate ? `Kennz. ${v.license_plate}` : null,
      v.vin ? `VIN ${v.vin}` : null,
      v.mileage != null ? `${formatNumber(v.mileage)} km` : null,
    ].filter(Boolean).join(" · ");
    doc.text(inline, M, y, { maxWidth: W - 2 * M });
    y += 8;
  }

  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - 2 * M, 8, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Beschreibung", M + 2, y + 5.5);
  doc.text("Menge", W - M - 60, y + 5.5, { align: "right" });
  doc.text("Einzelpreis", W - M - 30, y + 5.5, { align: "right" });
  doc.text("Gesamt", W - M - 2, y + 5.5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  let net = 0;
  const descMaxW2 = W - 2 * M - 72;
  const lineH2 = 5;
  const rowPad2 = 2;
  opts.positions.forEach((p) => {
    const total = p.quantity * p.unitPrice;
    net += total;
    const lines = doc.splitTextToSize(p.description, descMaxW2) as string[];
    lines.forEach((ln, i) => doc.text(ln, M + 2, y + i * lineH2));
    doc.text(formatNumber(p.quantity), W - M - 60, y, { align: "right" });
    doc.text(formatPrice(p.unitPrice), W - M - 30, y, { align: "right" });
    doc.text(formatPrice(total), W - M - 2, y, { align: "right" });
    y += Math.max(1, lines.length) * lineH2 + rowPad2;
  });

  doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 6;
  const totalsX = W - M - 60;
  const vat = opts.diff ? 0 : net * (opts.vatRate / 100);
  const gross = net + vat;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  if (opts.diff) {
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text("Differenzbesteuerung gem. § 25a UStG. MwSt. nicht ausweisbar.", M, y);
    doc.setTextColor(0); doc.setFontSize(10); y += 6;
  } else {
    doc.text("Nettobetrag", totalsX, y);
    doc.text(formatPrice(net), W - M, y, { align: "right" }); y += 6;
    doc.text(`MwSt. ${opts.vatRate}%`, totalsX, y);
    doc.text(formatPrice(vat), W - M, y, { align: "right" }); y += 6;
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Gesamtbetrag", totalsX, y);
  doc.text(formatPrice(gross), W - M, y, { align: "right" });
  y += 10;

  if (opts.paymentMethod) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text(`Zahlungsart: ${opts.paymentMethod}`, M, y); y += 6;
  }
  if (opts.notes) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text(opts.notes, M, y, { maxWidth: W - 2 * M });
    doc.setTextColor(0);
  }

  drawFooter(doc, c, W, M);
  return doc;
}

/** Build a MotorhomeForPdf from free-form vehicle data to reuse existing generators. */
export function buildExternalMotorhome(input: {
  brand?: string;
  model?: string;
  vin?: string;
  license_plate?: string;
  first_registration?: string;
  year?: number | null;
  mileage?: number | null;
  color?: string;
  fuel?: string;
  body_type?: MotorhomeBodyType | null;
  price?: number | null;
}): MotorhomeForPdf {
  return {
    id: "external",
    brand: input.brand ?? "",
    model: input.model ?? "",
    year: input.year ?? null,
    mileage: input.mileage ?? null,
    price: input.price ?? null,
    vin: input.vin ?? null,
    license_plate: input.license_plate ?? null,
    color: input.color ?? null,
    fuel: input.fuel ?? null,
    transmission: null,
    power_hp: null,
    power_kw: null,
    displacement_cc: null,
    body_type: input.body_type ?? null,
    sitting_places: null,
    sleeping_places: null,
    length_mm: null,
    width_mm: null,
    height_mm: null,
    gross_weight_kg: null,
    features: [],
    first_registration: input.first_registration ?? null,
    main_image_url: null,
  };
}

