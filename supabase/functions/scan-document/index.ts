// Edge function: scans an ID card (front+back), a vehicle registration (ZB I),
// or booking/rental documents using Lovable AI Gateway and returns structured data.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ID_SCHEMA = {
  type: "object",
  properties: {
    full_name: { type: "string", description: "Vollständiger Name in der Reihenfolge 'Vorname Nachname'. Wenn auf dem Ausweis 'Nachname / Surname' separat steht, kombiniere in der Form 'Vorname Nachname'." },
    first_name: { type: "string" },
    last_name: { type: "string" },
    birth_date: { type: "string", description: "Geburtsdatum im Format YYYY-MM-DD" },
    birth_place: { type: "string" },
    nationality: { type: "string" },
    id_number: { type: "string", description: "Ausweisnummer / Dokumentennummer" },
    issue_date: { type: "string", description: "Ausstellungsdatum YYYY-MM-DD" },
    expiry_date: { type: "string", description: "Gültig bis YYYY-MM-DD" },
    issuing_authority: { type: "string", description: "Ausstellende Behörde (von der Rückseite)" },
    street: { type: "string", description: "Straße + Hausnummer (Rückseite)" },
    zip: { type: "string", description: "PLZ" },
    city: { type: "string", description: "Wohnort" },
    address: { type: "string", description: "Vollständige Anschrift im Format 'Straße Hausnummer\\nPLZ Ort'" },
  },
  additionalProperties: false,
};

const ZB1_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string", description: "Marke / Hersteller (Feld D.1)" },
    model: { type: "string", description: "Typ / Handelsbezeichnung (Feld D.2 / D.3)" },
    vin: { type: "string", description: "Fahrzeug-Identifizierungsnummer / VIN (Feld E)" },
    license_plate: { type: "string", description: "Amtliches Kennzeichen" },
    first_registration: { type: "string", description: "Tag der Erstzulassung im Format YYYY-MM-DD (Feld B)" },
    color: { type: "string", description: "Farbe (Feld R)" },
    fuel: { type: "string", description: "Kraftstoffart (Feld P.3) z.B. 'Diesel', 'Benzin'" },
    power_kw: { type: "integer", description: "Leistung in kW (Feld P.2)" },
    displacement_cc: { type: "integer", description: "Hubraum in cm³ (Feld P.1)" },
    owner_name: { type: "string", description: "Halter: Name, Vorname bzw. Firma (Feld C.1.1)" },
    owner_street: { type: "string", description: "Halter-Adresse Straße + Nr. (Feld C.1.2)" },
    owner_zip: { type: "string", description: "Halter PLZ" },
    owner_city: { type: "string", description: "Halter Wohnort (Feld C.1.3)" },
    owner_address: { type: "string", description: "Vollständige Halter-Anschrift 'Straße Nr.\\nPLZ Ort'" },
  },
  additionalProperties: false,
};

const BOOKING_SCHEMA = {
  type: "object",
  properties: {
    customer_name: { type: "string", description: "Voller Name des Mieters/Kunden" },
    customer_street: { type: "string" },
    customer_zip: { type: "string" },
    customer_city: { type: "string" },
    customer_address: { type: "string", description: "Vollständige Anschrift 'Straße Nr.\\nPLZ Ort'" },
    customer_email: { type: "string" },
    customer_phone: { type: "string" },
    booking_number: { type: "string", description: "Buchungs-/Reservierungsnummer" },
    rental_start: { type: "string", description: "Mietbeginn YYYY-MM-DD" },
    rental_end: { type: "string", description: "Mietende YYYY-MM-DD" },
    vehicle_brand: { type: "string" },
    vehicle_model: { type: "string" },
    vehicle_license_plate: { type: "string" },
    vehicle_vin: { type: "string" },
    mileage_out: { type: "integer", description: "Kilometerstand bei Übergabe" },
    mileage_in: { type: "integer", description: "Kilometerstand bei Rückgabe" },
    damage_description: { type: "string", description: "Ausführliche Beschreibung der dokumentierten Schäden inkl. Lage am Fahrzeug, Größe und betroffener Bauteile. Mehrere Schäden mit Bindestrichen aufzählen." },
    additional_notes: { type: "string", description: "Sonstige relevante Hinweise aus dem Übergabe-/Rückgabeprotokoll" },
  },
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json() as {
      mode: "id" | "zb1" | "booking";
      images: string[]; // data URLs (data:image/jpeg;base64,...)
    };
    const { mode, images } = body;

    if (!mode || !["id", "zb1", "booking"].includes(mode)) {
      return new Response(JSON.stringify({ error: "mode muss 'id', 'zb1' oder 'booking' sein" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: "images fehlt" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY nicht konfiguriert" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let schema: Record<string, unknown>;
    let fnName: string;
    let sys: string;
    let userText: string;

    if (mode === "id") {
      schema = ID_SCHEMA;
      fnName = "set_id_data";
      sys = "Du extrahierst Daten von einem deutschen/EU Personalausweis oder Reisepass. Es können bis zu zwei Bilder geliefert werden (Vorder- und Rückseite). Lies sorgfältig OCR. Datumsformat strikt YYYY-MM-DD. Adresse ist nur auf der Rückseite zu finden. Wenn etwas nicht eindeutig lesbar ist, lass das Feld weg.";
      userText = "Extrahiere alle Halter-/Personendaten aus diesem Ausweis.";
    } else if (mode === "zb1") {
      schema = ZB1_SCHEMA;
      fnName = "set_zb1_data";
      sys = "Du extrahierst Daten aus einer deutschen Zulassungsbescheinigung Teil I (Fahrzeugschein). Es können bis zu zwei Bilder geliefert werden (Vorder- und Rückseite). Beachte die Feldcodes (B, C.1.1, D.1, E, P.1, P.2, P.3, R). Datumsformat strikt YYYY-MM-DD. Wenn etwas nicht eindeutig lesbar ist, lass das Feld weg.";
      userText = "Extrahiere alle Fahrzeug- und Halter-Daten aus dieser Zulassungsbescheinigung Teil I.";
    } else {
      schema = BOOKING_SCHEMA;
      fnName = "set_booking_data";
      sys = "Du extrahierst Daten aus Buchungs-, Miet- oder Übergabe-/Rückgabeprotokollen eines Wohnmobil-Vermieters. Es können mehrere Seiten geliefert werden. Lies alle Felder per OCR. Datumsformat strikt YYYY-MM-DD. Beschreibe Schäden klar und vollständig (Position am Fahrzeug, Art, Größe). Felder die nicht eindeutig lesbar sind, lass weg.";
      userText = "Extrahiere Kunden-, Fahrzeug- und Schadensdaten aus diesen Buchungsunterlagen / Übergabeprotokollen.";
    }

    const imageParts = images.map((url) => ({ type: "image_url" as const, image_url: { url } }));

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: [{ type: "text", text: userText }, ...imageParts] },
        ],
        tools: [{
          type: "function",
          function: { name: fnName, description: "Setzt die extrahierten Daten", parameters: schema },
        }],
        tool_choice: { type: "function", function: { name: fnName } },
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit erreicht, bitte später erneut versuchen." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "Lovable AI Guthaben aufgebraucht. Bitte im Workspace aufladen." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
