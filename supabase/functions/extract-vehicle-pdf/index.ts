// Edge function: extracts vehicle data from a PDF using Lovable AI Gateway (Gemini)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VEHICLE_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string", description: "Marke / Hersteller (z.B. 'Mercedes-Benz')" },
    model: { type: "string", description: "VOLLSTÄNDIGE Inserat-Überschrift OHNE Markenname am Anfang. Übernimm den kompletten Titel inklusive Ausstattungsstichworten und Sonderzeichen, z.B. wenn die Überschrift 'Mercedes-Benz C 200 T Avantgarde 55.000 km Navi Kamera LED !!' lautet, dann ist model = 'C 200 T Avantgarde 55.000 km Navi Kamera LED !!'. Nichts kürzen, nichts weglassen." },
    year: { type: "integer", description: "Baujahr (4-stellig)" },
    first_registration: { type: "string", description: "Erstzulassung im Format YYYY-MM-DD" },
    mileage: { type: "integer", description: "Kilometerstand" },
    price: { type: "number", description: "Preis in Euro" },
    vin: { type: "string", description: "Fahrgestellnummer / VIN (17 Zeichen)" },
    color: { type: "string", description: "Farbe" },
    fuel: { type: "string", enum: ["benzin","diesel","elektro","hybrid","lpg","cng","wasserstoff"] },
    transmission: { type: "string", enum: ["manuell","automatik","halbautomatik"] },
    power_hp: { type: "integer", description: "Leistung in PS" },
    power_kw: { type: "integer", description: "Leistung in kW" },
    displacement_cc: { type: "integer", description: "Hubraum in cm³" },
    doors: { type: "integer" },
    seats: { type: "integer" },
    features: { type: "array", items: { type: "string" }, description: "VOLLSTÄNDIGE Ausstattungs- und Beschreibungsliste vom oberen Bereich des PDFs. Übernimm wirklich JEDEN aufgeführten Punkt aus der Beschreibung/Ausstattung – nichts auslassen, nichts kürzen, nichts zusammenfassen. Jeder Punkt eine Zeile. WICHTIG: Lass Angaben zur Anzahl der Halter / Vorbesitzer komplett weg (z.B. '1 Halter', '2. Hand', 'Anzahl Halter: 1' niemals aufnehmen)." },
    hu_au: { type: "string", description: "HU/AU Fälligkeit oder 'NEU' falls neu" },
    emission_class: { type: "string", description: "Schadstoffklasse, z.B. 'Euro 5', 'Euro 6d'" },
    short_features: { type: "string", description: "Kurze Ausstattungs-Schlagzeile, max ~60 Zeichen, z.B. 'Automatik Leder Navi PDC'" },
    vat_deductible: { type: "boolean", description: "true wenn MwSt. ausweisbar, false bei Differenzbesteuerung" },
    tag_number: { type: "string", description: "Preisschild-Nummer, meist klein unten rechts auf dem Preisschild, z.B. 'Nr.:3' → '3'" },
    mobile_url: { type: "string", description: "Vollständige URL des mobile.de Inserats (z.B. https://suchen.mobile.de/fahrzeuge/details.html?id=...). Häufig im Footer oder neben dem QR-Code des PDFs zu finden." },
    regions: {
      type: "object",
      description: "Für jedes extrahierte Schlüsselfeld die ungefähre Position im PDF als normalisierte Bounding Box (x,y,w,h ∈ [0,1], Ursprung oben links) und Seiten-Index (0-basiert). Nur Felder zurückgeben, die tatsächlich im PDF sichtbar sind.",
      properties: {
        price:          { type: "object", properties: { page: { type: "integer" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } } },
        hu_au:          { type: "object", properties: { page: { type: "integer" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } } },
        emission_class: { type: "object", properties: { page: { type: "integer" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } } },
        tag_number:     { type: "object", properties: { page: { type: "integer" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } } },
        short_features: { type: "object", properties: { page: { type: "integer" }, x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } } },
      },
    },
  },
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { pdfUrl, pdfBase64, mimeType, images } = body as {
      pdfUrl?: string; pdfBase64?: string; mimeType?: string; images?: string[];
    };
    // Build image_url parts. Prefer pre-rasterized images (small JPEGs) to stay
    // under the AI provider's 30MB per-image limit.
    const imageParts: Array<{ type: "image_url"; image_url: { url: string } }> = [];
    if (Array.isArray(images) && images.length) {
      for (const url of images) imageParts.push({ type: "image_url", image_url: { url } });
    } else if (pdfUrl) {
      imageParts.push({ type: "image_url", image_url: { url: pdfUrl } });
    } else if (pdfBase64) {
      imageParts.push({ type: "image_url", image_url: { url: `data:${mimeType || "application/pdf"};base64,${pdfBase64}` } });
    } else {
      return new Response(JSON.stringify({ error: "images, pdfUrl oder pdfBase64 fehlt" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY nicht konfiguriert" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: "Du extrahierst Fahrzeugdaten aus einem mobile.de PDF Inserat oder einem bereits gedruckten Preisschild. Lies auch die Preisschild-Nummer (z.B. 'Nr.:3' oben oder unten rechts) als reine Zahl in 'tag_number' (ohne 'Nr.:'-Präfix).\n\n- hu_au: 'NEU' oder 'MM/YYYY'.\n- emission_class: z.B. 'Euro 6d-TEMP', exakter Wortlaut.\n- price: reine Zahl OHNE Trennzeichen/Währung.\n- vat_deductible: true bei 'MwSt. ausweisbar'; false bei 'Differenzbesteuerung'.\n- short_features: 3-5 Highlights, ~60 Zeichen.\n- mobile_url: Suche im PDF (besonders Footer / Kopfzeile / neben QR-Code) nach der vollständigen mobile.de Inserats-URL (z.B. 'https://suchen.mobile.de/fahrzeuge/details.html?id=123456789'). Wenn vorhanden, exakt zurückgeben.\n\nZUSÄTZLICH: Fülle 'regions' mit normalisierten Bounding-Box-Koordinaten (x,y,w,h ∈ [0,1], Ursprung oben links, page=0-basiert) für jedes der Felder price, hu_au, emission_class, tag_number, short_features – aber NUR wenn das Feld tatsächlich im PDF sichtbar ist. Schätze die Box so präzise wie möglich um die jeweilige Beschriftung herum.\n\nDatumsformat YYYY-MM-DD.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrahiere die Fahrzeugdaten aus diesem Dokument." },
              ...imageParts,
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "set_vehicle_data",
            description: "Setzt die extrahierten Fahrzeugdaten",
            parameters: VEHICLE_SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "set_vehicle_data" } },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit erreicht, bitte später erneut versuchen." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Lovable AI Guthaben aufgebraucht. Bitte im Workspace aufladen." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: `AI Gateway Fehler: ${text}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : {};

    return new Response(JSON.stringify({ data: args }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
