// Edge function: extracts motorhome data either from a sales-listing PDF
// (mode = "inserat") or from a German Zulassungsbescheinigung Teil I /
// Fahrzeugschein (mode = "fahrzeugschein"). Uses Lovable AI Gateway (Gemini).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const INSERAT_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string", description: "Marke / Hersteller (z.B. 'Hymer', 'Knaus')" },
    model: { type: "string", description: "VOLLSTÄNDIGE Inserat-Überschrift OHNE Markenname am Anfang. Übernimm den kompletten Titel inklusive Ausstattungsstichworten." },
    year: { type: "integer", description: "Baujahr (4-stellig)" },
    first_registration: { type: "string", description: "Erstzulassung im Format YYYY-MM-DD" },
    mileage: { type: "integer", description: "Kilometerstand" },
    price: { type: "number", description: "Preis in Euro, reine Zahl" },
    vin: { type: "string", description: "Fahrgestellnummer / VIN (17 Zeichen)" },
    color: { type: "string" },
    fuel: { type: "string", enum: ["benzin", "diesel", "elektro", "hybrid", "lpg", "cng", "wasserstoff"] },
    transmission: { type: "string", enum: ["manuell", "automatik", "halbautomatik"] },
    power_hp: { type: "integer" },
    power_kw: { type: "integer" },
    displacement_cc: { type: "integer" },
    body_type: { type: "string", enum: ["alkoven", "teilintegriert", "vollintegriert", "kastenwagen"], description: "Aufbauart des Wohnmobils" },
    sleeping_places: { type: "integer", description: "Anzahl Schlafplätze" },
    sitting_places: { type: "integer", description: "Anzahl Sitzplätze (mit Gurten)" },
    length_mm: { type: "integer", description: "Länge in Millimetern" },
    width_mm: { type: "integer", description: "Breite in Millimetern" },
    height_mm: { type: "integer", description: "Höhe in Millimetern" },
    gross_weight_kg: { type: "integer", description: "Zulässige Gesamtmasse in kg" },
    features: { type: "array", items: { type: "string" }, description: "VOLLSTÄNDIGE Ausstattungsliste (Markise, Solar, Sat-Anlage, Heizung, Klima, Mover, etc.). JEDEN Punkt aufnehmen, nichts kürzen, eine Zeile pro Eintrag. Halter-/Vorbesitzer-Angaben WEGLASSEN." },
  },
  additionalProperties: false,
};

const FAHRZEUGSCHEIN_SCHEMA = {
  type: "object",
  description: "Daten aus der deutschen Zulassungsbescheinigung Teil I (Fahrzeugschein)",
  properties: {
    license_plate: { type: "string", description: "Feld A: Amtliches Kennzeichen, z.B. 'MD-AB 1234'. Mit Bindestrich und Leerzeichen wie aufgedruckt." },
    first_registration: { type: "string", description: "Feld B: Tag der Erstzulassung als YYYY-MM-DD" },
    brand: { type: "string", description: "Feld D.1: Marke / Hersteller" },
    model: { type: "string", description: "Feld D.2 + D.3: Typ und Handelsbezeichnung kombiniert" },
    vin: { type: "string", description: "Feld E: Fahrzeug-Identifizierungsnummer (17 Zeichen)" },
    body_type: { type: "string", enum: ["alkoven", "teilintegriert", "vollintegriert", "kastenwagen"], description: "Aus Feld J / Aufbau, falls erkennbar (Wohnmobil-Aufbauart). Sonst weglassen." },
    displacement_cc: { type: "integer", description: "Feld P.1: Hubraum in cm³" },
    power_kw: { type: "integer", description: "Feld P.2: Nennleistung in kW" },
    fuel: { type: "string", enum: ["benzin", "diesel", "elektro", "hybrid", "lpg", "cng", "wasserstoff"], description: "Feld P.3: Kraftstoffart" },
    gross_weight_kg: { type: "integer", description: "Feld F.1 (technisch zulässig) oder F.2 (zul. Gesamtmasse) in kg" },
    sitting_places: { type: "integer", description: "Feld S.1: Anzahl Sitzplätze inkl. Fahrer" },
    color: { type: "string", description: "Farbe des Fahrzeugs, falls im Schein angegeben" },
  },
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { mode, images, pdfUrl, pdfBase64, mimeType } = body as {
      mode?: "inserat" | "fahrzeugschein";
      images?: string[];
      pdfUrl?: string;
      pdfBase64?: string;
      mimeType?: string;
    };

    const extractionMode = mode === "fahrzeugschein" ? "fahrzeugschein" : "inserat";

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

    const isFahrzeugschein = extractionMode === "fahrzeugschein";

    const systemPrompt = isFahrzeugschein
      ? "Du extrahierst Daten aus einer deutschen Zulassungsbescheinigung Teil I (Fahrzeugschein). Lies die nummerierten Felder (A, B, D.1, D.2, E, F.1/F.2, J, P.1, P.2, P.3, S.1) sorgfältig.\n- license_plate: Kennzeichen aus Feld A, exakt wie aufgedruckt (z.B. 'MD-AB 1234').\n- first_registration: Feld B als YYYY-MM-DD.\n- brand: Feld D.1.\n- model: Feld D.2 (Typ) + D.3 (Handelsbezeichnung) zusammen.\n- vin: Feld E, 17 Zeichen.\n- displacement_cc: Feld P.1 (Hubraum in cm³).\n- power_kw: Feld P.2 (Nennleistung in kW, ohne Umrechnung).\n- fuel: Feld P.3 (z.B. 'DIESEL' → 'diesel').\n- gross_weight_kg: bevorzugt Feld F.2 (zulässige Gesamtmasse), sonst F.1.\n- sitting_places: Feld S.1.\nNur Felder zurückgeben, die du tatsächlich lesen kannst."
      : "Du extrahierst Daten aus einem Wohnmobil-Inserat (PDF, z.B. mobile.de). Übernimm Marke, Modell-Titel, Maße, Schlaf-/Sitzplätze, Aufbauart und VOLLSTÄNDIG die Ausstattungsliste. Halter-/Vorbesitzer-Angaben WEGLASSEN. Datumsformat YYYY-MM-DD. Preise als reine Zahlen ohne Trennzeichen.";

    const userText = isFahrzeugschein
      ? "Extrahiere die Daten aus diesem Fahrzeugschein."
      : "Extrahiere die Wohnmobil-Daten aus diesem Inserat.";

    const toolName = isFahrzeugschein ? "set_fahrzeugschein_data" : "set_motorhome_data";
    const schema = isFahrzeugschein ? FAHRZEUGSCHEIN_SCHEMA : INSERAT_SCHEMA;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              ...imageParts,
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: toolName,
            description: isFahrzeugschein ? "Setzt die aus dem Fahrzeugschein extrahierten Daten" : "Setzt die extrahierten Wohnmobil-Daten",
            parameters: schema,
          },
        }],
        tool_choice: { type: "function", function: { name: toolName } },
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

    return new Response(JSON.stringify({ data: args, mode: extractionMode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
