import jsPDF from "jspdf";
import QRCode from "qrcode";
import { FUEL_LABELS, TRANSMISSION_LABELS, formatNumber, formatPrice } from "./vehicles";

export interface PriceTagExtras {
  hu_au?: string | null;
  emission_class?: string | null;
  short_features?: string | null;
  vat_deductible?: boolean | null;
  qr_url?: string | null;
  number?: string | null;
  owners?: number | null;
  category?: string | null;
  consumption?: string | null;
  description?: string | null;
}

export interface VehicleForPdf {
  id: string;
  brand: string; model: string;
  year: number | null; mileage: number | null; price: number | null;
  vin: string | null; color: string | null;
  fuel: string | null; transmission: string | null;
  power_hp: number | null; power_kw: number | null;
  displacement_cc: number | null; doors: number | null; seats: number | null;
  features: string[]; first_registration: string | null;
  main_image_url: string | null;
  notes?: string | null;
}

export interface CompanyData {
  company_name?: string | null;
  address_street?: string | null;
  address_zip?: string | null;
  address_city?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  vat_id?: string | null;
  tax_number?: string | null;
  bank_name?: string | null;
  bank_iban?: string | null;
  bank_bic?: string | null;
  logo_url?: string | null;
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
  } catch { return null; }
}

export async function generatePriceTag(v: VehicleForPdf, c: CompanyData, extras: PriceTagExtras = {}): Promise<jsPDF> {
  // A3 Portrait: 297 × 420 mm. Druckränder:
  //  - MediaBox  = volle Blattgröße (Bleed-fähig)
  //  - BleedBox  = 3 mm Beschnittzugabe
  //  - TrimBox   = exaktes Endformat (das, worauf Drucker schneiden)
  //  - CropBox   = sichtbarer Bereich (= TrimBox)
  //  - ArtBox    = sicherer Inhaltsbereich (10 mm Sicherheitsabstand)
  const doc = new jsPDF({ unit: "mm", format: "a3", orientation: "portrait", compress: true });
  // Feste Skalierung: kein Auto-Fit beim Drucken (1:1 in Originalgröße)
  try {
    (doc as any).viewerPreferences?.({
      PrintScaling: "None",
      NumCopies: 1,
      ViewArea: "CropBox",
      ViewClip: "CropBox",
      PrintArea: "TrimBox",
      PrintClip: "TrimBox",
      Duplex: "Simplex",
    }, true);
  } catch { /* viewerPreferences plugin optional */ }
  const W = 297, H = 420;
  // Page-Boxes (PDF unit = pt). 1 mm = 2.83464567 pt
  const MM_TO_PT = 72 / 25.4;
  const mmBox = (l: number, b: number, r: number, t: number) => ({
    bottomLeftX: l * MM_TO_PT,
    bottomLeftY: b * MM_TO_PT,
    topRightX: r * MM_TO_PT,
    topRightY: t * MM_TO_PT,
  });
  try {
    const pageCtx = (doc as any).internal.getPageInfo(1).pageContext;
    pageCtx.mediaBox = mmBox(0, 0, W, H);                 // volles Blatt
    pageCtx.bleedBox = mmBox(-3, -3, W + 3, H + 3);        // 3 mm Beschnittzugabe (für Drucke mit Bleed)
    pageCtx.trimBox  = mmBox(0, 0, W, H);                 // Endformat
    pageCtx.cropBox  = mmBox(0, 0, W, H);                 // sichtbarer Bereich
    pageCtx.artBox   = mmBox(10, 10, W - 10, H - 10);      // sicherer Inhalt
  } catch { /* falls Internas nicht verfügbar, MediaBox bleibt korrekt */ }

  const RED: [number, number, number] = [220, 30, 35];
  const RED_DARK: [number, number, number] = [180, 22, 28];
  const GRAY_BG: [number, number, number] = [225, 225, 225];
  const GRAY_LINE: [number, number, number] = [170, 170, 170];
  const INK: [number, number, number] = [25, 25, 25];

  // Full red background
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, H, "F");

  // Header: company name + address (white, centered)
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(42);
  doc.text(c.company_name || "", W / 2, 34, { align: "center", maxWidth: W - 30 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(20);
  const addr = [c.address_street, `${c.address_zip ?? ""} ${c.address_city ?? ""}`.trim()].filter(Boolean).join(" / ");
  if (addr) doc.text(addr, W / 2, 50, { align: "center" });

  // White content area
  const frame = 14;
  const cx = frame;
  const cy = 70;
  const cw = W - 2 * frame;
  const bottomBarH = 18;
  const ch = H - cy - frame - bottomBarH - 2;
  doc.setFillColor(255, 255, 255);
  doc.rect(cx, cy, cw, ch, "F");

  // "Gebrauchtfahrzeug" eyebrow
  let y = cy + 14;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(20);
  doc.text("Gebrauchtfahrzeug", cx + cw / 2, y, { align: "center" });

  // Brand model big — auto-shrink + Mehrzeilig, nichts wird abgeschnitten
  y += 13;
  doc.setFont("helvetica", "bold");
  {
    const title = `${v.brand} ${v.model}`.toUpperCase();
    const maxW = cw - 16;
    let fs = 28;
    let lines: string[] = [];
    while (fs >= 16) {
      doc.setFontSize(fs);
      lines = doc.splitTextToSize(title, maxW) as string[];
      if (lines.length <= 2) break;
      fs -= 2;
    }
    const lh = fs * 0.42;
    lines.forEach((line, i) => doc.text(line, cx + cw / 2, y + i * lh, { align: "center" }));
    y += (lines.length - 1) * lh;
  }

  // Kurzausstattung (Überschrift) — auto-shrink, mehrzeilig, vollständig
  if (extras.short_features) {
    y += 10;
    doc.setFont("helvetica", "bold");
    const maxW = cw - 20;
    let fs = 15;
    let lines: string[] = [];
    while (fs >= 10) {
      doc.setFontSize(fs);
      lines = doc.splitTextToSize(extras.short_features, maxW) as string[];
      if (lines.length <= 3) break;
      fs -= 1;
    }
    const lh = fs * 0.42;
    lines.forEach((line, i) => doc.text(line, cx + cw / 2, y + i * lh, { align: "center" }));
    y += (lines.length - 1) * lh;
  }

  // "Fahrzeugdaten" label
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text("Fahrzeugdaten", cx + 6, y);
  y += 5;

  // 4x2 cell grid
  const gap = 4;
  const gridW = cw - 12;
  const cellW = (gridW - 3 * gap) / 4;
  const cellH = 32;
  const transLabel = v.transmission && TRANSMISSION_LABELS[v.transmission as keyof typeof TRANSMISSION_LABELS];
  const fuelLabel = v.fuel && FUEL_LABELS[v.fuel as keyof typeof FUEL_LABELS];
  const t = (s: unknown) => (s == null || s === "" ? "—" : String(s));
  const cells: [string, string][] = [
    ["Getriebe", t(transLabel)],
    ["Kraftstoff", t(fuelLabel)],
    ["Kilometer", v.mileage != null ? `${formatNumber(v.mileage)} km` : "—"],
    ["Erstzulassung", v.first_registration ? formatDeMonthYear(v.first_registration) : (v.year ? `EZ ${v.year}` : "—")],
    ["Hubraum", v.displacement_cc ? `${v.displacement_cc} ccm` : "—"],
    ["Motorisierung", v.power_kw && v.power_hp ? `${v.power_kw} kW / ${v.power_hp} PS` : v.power_hp ? `${v.power_hp} PS` : "—"],
    ["HU/AU", t(extras.hu_au)],
    ["Schadstoffklasse", t(extras.emission_class)],
  ];
  cells.forEach((c2, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = cx + 6 + col * (cellW + gap);
    const yy = y + row * (cellH + gap);
    doc.setFillColor(...GRAY_BG);
    doc.rect(x, yy, cellW, cellH, "F");
    doc.setDrawColor(...GRAY_LINE);
    doc.setLineWidth(0.3);
    doc.rect(x, yy, cellW, cellH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.setTextColor(...INK);
    doc.text(c2[0], x + cellW / 2, yy + 9, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(c2[1], x + cellW / 2, yy + 23, { align: "center", maxWidth: cellW - 3 });
  });
  y += 2 * cellH + gap + 8;

  // QR + contact gray box
  const boxX = cx + 6;
  const boxW = gridW;
  const boxH = 100;
  doc.setFillColor(...GRAY_BG);
  doc.rect(boxX, y, boxW, boxH, "F");

  // QR right side
  const qrSize = boxH - 10;
  const qrX = boxX + boxW - qrSize - 8;
  const qrY = y + 5;
  const qrPayload = extras.qr_url
    || c.website
    || `${v.brand} ${v.model}${v.price ? " " + formatNumber(v.price) + " EUR" : ""}${c.phone ? " Tel: " + c.phone : ""}`;
  try {
    const qrData = await QRCode.toDataURL(qrPayload, { margin: 1, width: 800, errorCorrectionLevel: "M" });
    doc.setFillColor(255, 255, 255);
    doc.rect(qrX, qrY, qrSize, qrSize, "F");
    doc.addImage(qrData, "PNG", qrX + 3, qrY + 3, qrSize - 6, qrSize - 6);
  } catch { /* ignore */ }

  // Left text
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(20);
  doc.text("Für mehr Informationen", boxX + 8, y + 18);
  doc.text("bitte", boxX + 8, y + 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.text("QR-CODE SCANNEN!", boxX + 8, y + 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.text("Oder kontaktieren Sie uns", boxX + 8, y + 65);
  doc.text("unter dieser Nummer", boxX + 8, y + 75);
  if (c.phone) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`Tel: ${c.phone}`, boxX + 8, y + 87);
  }

  y += boxH + 6;

  // Price + tag number row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(110);
  doc.setTextColor(...RED_DARK);
  const priceText = v.price != null ? `${formatNumber(v.price)}€` : "Preis auf Anfrage";
  doc.text(priceText, cx + cw / 2, y + 36, { align: "center" });

  if (extras.number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(18);
    doc.setTextColor(...INK);
    doc.text(`Nr.:${extras.number}`, cx + cw - 8, y + 18, { align: "right" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor(...INK);
  doc.text(extras.vat_deductible ? "MwSt. ausweisbar" : "MwSt. nicht ausweisbar", cx + cw / 2, y + 48, { align: "center" });

  // Finance line im weißen Feld unter dem Preis
  doc.setTextColor(...RED_DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text("0% ANZAHLEN    FLEXIBEL FINANZIEREN", cx + cw / 2, y + 62, { align: "center", maxWidth: cw - 12 });

  return doc;
}


function formatDeMonthYear(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `EZ ${m[2]}/${m[1]}`;
}

export interface FinancingPosterOpts {
  monthlyRate: number;
  disclaimer?: string;
  footline?: string;
}

export async function generateFinancingPoster(opts: FinancingPosterOpts): Promise<jsPDF> {
  // A4 quer: 297 × 210 mm
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true });
  const W = 297, H = 210;
  const RED: [number, number, number] = [227, 30, 36];
  const M = 12; // Außenrand

  const rate = Math.max(0, Math.round(opts.monthlyRate || 0));
  const disclaimer = opts.disclaimer ?? "Das Ratenbeispiel bezieht sich auf das Finanzierungsangebot der Santander Consumer Bank";
  const footline = opts.footline ?? "0% ANZAHLEN  FLEXIBLE FINANZIEREN";

  // Auto-fit Helper: maximale Schriftgröße, sodass Text in maxWidth (mm) passt
  const fitFontSize = (text: string, maxWidthMm: number, startPt: number, minPt = 12) => {
    let pt = startPt;
    doc.setFontSize(pt);
    while (pt > minPt && doc.getTextWidth(text) > maxWidthMm) {
      pt -= 2;
      doc.setFontSize(pt);
    }
    return pt;
  };

  // 1) "monatlich" oben — groß, ca. 18% Höhe
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  fitFontSize("monatlich", W - 2 * M, 86);
  doc.text("monatlich", W / 2, 40, { align: "center", baseline: "alphabetic" });

  // 2) Rote Box — dominanter Mittelblock (~55% Höhe)
  const boxY = 50;
  const boxH = 116;
  const boxX = M;
  const boxW = W - 2 * M;
  doc.setFillColor(RED[0], RED[1], RED[2]);
  doc.roundedRect(boxX, boxY, boxW, boxH, 10, 10, "F");

  // 3) "nur XXX€" — auto-fit auf Boxbreite
  const rateLabel = `nur ${rate}€`;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  fitFontSize(rateLabel, boxW - 24, 230, 60);
  // Vertikal mittig
  doc.text(rateLabel, W / 2, boxY + boxH / 2, { align: "center", baseline: "middle" });

  // 4) Disclaimer
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  fitFontSize(`*  ${disclaimer}`, W - 2 * M, 12, 8);
  doc.text(`*  ${disclaimer}`, W / 2, boxY + boxH + 9, { align: "center" });

  // 5) Footline groß rot
  doc.setTextColor(RED[0], RED[1], RED[2]);
  doc.setFont("helvetica", "bold");
  fitFontSize(footline, W - 2 * M, 40, 18);
  doc.text(footline, W / 2, H - 12, { align: "center", baseline: "alphabetic" });

  return doc;
}

export async function generateInvoice(v: VehicleForPdf, c: CompanyData, opts: {
  buyerName: string; buyerAddress: string; invoiceNumber: string; date: string;
  vatRate: number; isInvoice: boolean;
}): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 20;

  // Header (logo + company)
  let headerH = 0;
  if (c.logo_url) {
    const img = await loadImage(c.logo_url);
    if (img) {
      const h = 18, w = img.w * (h / img.h);
      doc.addImage(img.data, "PNG", M, M, w, h);
      headerH = h;
    }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(c.company_name || "", W - M, M + 4, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100);
  const headerRight = [
    c.address_street,
    `${c.address_zip ?? ""} ${c.address_city ?? ""}`.trim(),
    c.phone, c.email, c.website,
  ].filter(Boolean);
  headerRight.forEach((l, i) => doc.text(l!, W - M, M + 9 + i * 4, { align: "right" }));
  doc.setTextColor(0);

  let y = M + Math.max(headerH, headerRight.length * 4 + 9) + 10;

  // Buyer
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("RECHNUNG AN", M, y); y += 5;
  doc.setFontSize(11); doc.setTextColor(0);
  doc.setFont("helvetica", "bold"); doc.text(opts.buyerName || "—", M, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  opts.buyerAddress.split("\n").forEach(line => { doc.text(line, M, y); y += 5; });

  // Invoice metadata
  let yMeta = M + Math.max(headerH, headerRight.length * 4 + 9) + 10;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(opts.isInvoice ? "RECHNUNG" : "BELEG", W - M, yMeta, { align: "right" });
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.invoiceNumber, W - M, yMeta + 5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Datum: ${opts.date}`, W - M, yMeta + 10, { align: "right" });

  y = Math.max(y, yMeta + 18) + 10;

  // Title
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(opts.isInvoice ? "Rechnung" : "Verkaufsbeleg", M, y);
  y += 10;

  // Vehicle line item
  doc.setDrawColor(200);
  doc.setFillColor(245, 245, 245);
  doc.rect(M, y, W - 2 * M, 8, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Position", M + 2, y + 5.5);
  doc.text("Betrag", W - M - 2, y + 5.5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(`${v.brand} ${v.model}`, M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100);
  const details = [
    v.year ? `Baujahr ${v.year}` : null,
    v.mileage != null ? `${formatNumber(v.mileage)} km` : null,
    v.vin ? `VIN: ${v.vin}` : null,
    v.color ? `Farbe: ${v.color}` : null,
    v.fuel ? FUEL_LABELS[v.fuel as keyof typeof FUEL_LABELS] : null,
  ].filter(Boolean).join(" · ");
  doc.text(details, M, y + 5);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(formatPrice(v.price), W - M, y, { align: "right" });
  y += 14;

  doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 6;

  // Totals
  const gross = v.price ?? 0;
  const net = opts.vatRate > 0 ? gross / (1 + opts.vatRate / 100) : gross;
  const vat = gross - net;

  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  const totalsX = W - M - 60;
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

  y += 20;

  // Footer
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(120);
  const footerLines = [
    c.vat_id ? `USt-IdNr.: ${c.vat_id}` : null,
    c.tax_number ? `Steuernr.: ${c.tax_number}` : null,
    c.bank_name && c.bank_iban ? `Bank: ${c.bank_name} · IBAN ${c.bank_iban}${c.bank_bic ? ` · BIC ${c.bank_bic}` : ""}` : null,
  ].filter(Boolean) as string[];
  footerLines.forEach((l, i) => doc.text(l, M, 280 - (footerLines.length - i) * 4));

  return doc;
}

export async function generateContract(v: VehicleForPdf, c: CompanyData, opts: {
  buyerName: string; buyerAddress: string; buyerIdNumber: string; date: string; place: string;
}): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 20;
  let y = M;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Kaufvertrag über ein gebrauchtes Kraftfahrzeug", M, y); y += 10;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("zwischen", M, y); y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Verkäufer", M, y); y += 5;
  doc.setFont("helvetica", "normal");
  [
    c.company_name,
    c.address_street,
    `${c.address_zip ?? ""} ${c.address_city ?? ""}`.trim(),
    c.phone ? `Tel.: ${c.phone}` : null,
    c.vat_id ? `USt-IdNr.: ${c.vat_id}` : null,
  ].filter(Boolean).forEach(l => { doc.text(l!, M, y); y += 5; });

  y += 4;
  doc.text("und", M, y); y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Käufer", M, y); y += 5;
  doc.setFont("helvetica", "normal");
  doc.text(opts.buyerName || "—", M, y); y += 5;
  opts.buyerAddress.split("\n").forEach(l => { doc.text(l, M, y); y += 5; });
  if (opts.buyerIdNumber) { doc.text(`Ausweis-Nr.: ${opts.buyerIdNumber}`, M, y); y += 5; }

  y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("§ 1 Kaufgegenstand", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const facts: [string, string][] = [
    ["Marke / Modell", `${v.brand} ${v.model}`],
    ["Erstzulassung", v.first_registration ?? (v.year?.toString() ?? "—")],
    ["Kilometerstand", v.mileage != null ? `${formatNumber(v.mileage)} km` : "—"],
    ["Fahrzeug-Ident-Nr. (VIN)", v.vin ?? "—"],
    ["Farbe", v.color ?? "—"],
    ["Kraftstoff", v.fuel ? FUEL_LABELS[v.fuel as keyof typeof FUEL_LABELS] : "—"],
    ["Getriebe", v.transmission ? TRANSMISSION_LABELS[v.transmission as keyof typeof TRANSMISSION_LABELS] : "—"],
    ["Leistung", v.power_hp ? `${v.power_hp} PS` : "—"],
  ];
  facts.forEach(([k, val]) => {
    doc.setTextColor(120); doc.text(k, M, y);
    doc.setTextColor(0); doc.text(val, M + 65, y);
    y += 5;
  });

  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("§ 2 Kaufpreis", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Der Kaufpreis beträgt ${formatPrice(v.price)} (in Worten: …………………………………………………………………).`, M, y, { maxWidth: W - 2 * M }); y += 6;
  doc.text("Der Kaufpreis ist bei Übergabe in bar oder per Überweisung fällig.", M, y); y += 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("§ 3 Gewährleistung", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const gw = "Das Fahrzeug wird unter Ausschluss jeder Gewährleistung verkauft, soweit gesetzlich zulässig. Der Verkäufer haftet jedoch für Vorsatz und grobe Fahrlässigkeit sowie für die Verletzung von Leben, Körper und Gesundheit.";
  doc.text(gw, M, y, { maxWidth: W - 2 * M }); y += 16;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("§ 4 Übergabe", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("Das Fahrzeug wird mit Unterzeichnung dieses Vertrages an den Käufer übergeben. Mit der Übergabe geht die Gefahr auf den Käufer über.", M, y, { maxWidth: W - 2 * M }); y += 16;

  // Place / date / signatures
  if (y > H - 60) { doc.addPage(); y = M; }
  doc.setFontSize(10);
  doc.text(`${opts.place || "…………………"}, den ${opts.date}`, M, y); y += 18;

  const colW = (W - 2 * M - 10) / 2;
  doc.setDrawColor(0);
  doc.line(M, y, M + colW, y);
  doc.line(M + colW + 10, y, W - M, y);
  doc.setFontSize(9); doc.setTextColor(100);
  doc.text("Verkäufer", M, y + 5);
  doc.text("Käufer", M + colW + 10, y + 5);

  return doc;
}

export interface OfferPosition { description: string; quantity: number; unitPrice: number; }

export async function generateOffer(v: VehicleForPdf, c: CompanyData, opts: {
  offerNumber: string; date: string; validUntil?: string;
  customerName?: string; customerAddress?: string;
  positions: OfferPosition[]; vatRate: number; notes?: string;
}): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 20;

  let headerH = 0;
  if (c.logo_url) {
    const img = await loadImage(c.logo_url);
    if (img) { const h = 18, w = img.w * (h / img.h); doc.addImage(img.data, "PNG", M, M, w, h); headerH = h; }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text(c.company_name || "", W - M, M + 4, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100);
  const headerRight = [c.address_street, `${c.address_zip ?? ""} ${c.address_city ?? ""}`.trim(), c.phone, c.email, c.website].filter(Boolean) as string[];
  headerRight.forEach((l, i) => doc.text(l, W - M, M + 9 + i * 4, { align: "right" }));
  doc.setTextColor(0);

  let y = M + Math.max(headerH, headerRight.length * 4 + 9) + 10;
  const headerY = y;

  if (opts.customerName) {
    doc.setFontSize(8); doc.setTextColor(120); doc.text("ANGEBOT FÜR", M, y); y += 5;
    doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
    doc.text(opts.customerName, M, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    (opts.customerAddress ?? "").split("\n").filter(Boolean).forEach(l => { doc.text(l, M, y); y += 5; });
  }
  doc.setFontSize(8); doc.setTextColor(120); doc.text("ANGEBOT", W - M, headerY, { align: "right" });
  doc.setFontSize(11); doc.setTextColor(0); doc.setFont("helvetica", "bold");
  doc.text(opts.offerNumber, W - M, headerY + 5, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`Datum: ${opts.date}`, W - M, headerY + 10, { align: "right" });
  if (opts.validUntil) doc.text(`Gültig bis: ${opts.validUntil}`, W - M, headerY + 15, { align: "right" });

  y = Math.max(y, headerY + 20) + 8;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Fahrzeug", M, y); y += 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  const vehInline = [`${v.brand} ${v.model}`, v.vin ? `VIN ${v.vin}` : null, v.mileage != null ? `${formatNumber(v.mileage)} km` : null].filter(Boolean).join(" · ");
  doc.text(vehInline, M, y, { maxWidth: W - 2 * M }); y += 8;

  doc.setFillColor(245, 245, 245); doc.rect(M, y, W - 2 * M, 8, "F");
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Beschreibung", M + 2, y + 5.5);
  doc.text("Menge", W - M - 60, y + 5.5, { align: "right" });
  doc.text("Einzelpreis", W - M - 30, y + 5.5, { align: "right" });
  doc.text("Gesamt", W - M - 2, y + 5.5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  let net = 0;
  const descMaxW = W - 2 * M - 72;
  opts.positions.forEach(p => {
    const total = p.quantity * p.unitPrice; net += total;
    const lines = doc.splitTextToSize(p.description, descMaxW) as string[];
    lines.forEach((ln, i) => doc.text(ln, M + 2, y + i * 5));
    doc.text(formatNumber(p.quantity), W - M - 60, y, { align: "right" });
    doc.text(formatPrice(p.unitPrice), W - M - 30, y, { align: "right" });
    doc.text(formatPrice(total), W - M - 2, y, { align: "right" });
    y += Math.max(1, lines.length) * 5 + 2;
  });

  doc.setDrawColor(220); doc.line(M, y, W - M, y); y += 6;
  const totalsX = W - M - 60;
  const vat = net * (opts.vatRate / 100); const gross = net + vat;
  doc.text("Nettobetrag", totalsX, y); doc.text(formatPrice(net), W - M, y, { align: "right" }); y += 6;
  doc.text(`MwSt. ${opts.vatRate}%`, totalsX, y); doc.text(formatPrice(vat), W - M, y, { align: "right" }); y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Gesamtsumme", totalsX, y); doc.text(formatPrice(gross), W - M, y, { align: "right" }); y += 10;

  if (opts.notes) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
    doc.text(opts.notes, M, y, { maxWidth: W - 2 * M }); doc.setTextColor(0); y += 8;
  }
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Dieses Angebot ist freibleibend.", M, y);
  return doc;
}
