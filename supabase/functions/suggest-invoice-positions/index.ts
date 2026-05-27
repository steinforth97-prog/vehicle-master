// Edge function: AI-Vorschlag für Rechnungspositionen anhand Beschreibung + optionaler Bilder
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Kurzer Titel/Betreff der Rechnung (z.B. 'Lackreparatur Seitenwand')" },
    summary: { type: "string", description: "1-3 Sätze Zusammenfassung des Schadens/Auftrags für Notizen" },
    notes: { type: "string", description: "Optionale interne Notizen / Hinweis für Kunde" },
    positions: {
      type: "array",
      description: "Rechnungspositionen (Arbeit, Material, Pauschalen). Realistische Preise in EUR netto.",
      items: {
        type: "object",
        properties: {
          description: { type: "string", description: "Klartext-Beschreibung der Leistung oder des Materials" },
          quantity: { type: "number", description: "Menge (Stk. oder Stunden)" },
          unitPrice: { type: "number", description: "Einzelpreis netto in EUR" },
        },
        required: ["description", "quantity", "unitPrice"],
        additionalProperties: false,
      },
    },
  },
  required: ["positions"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json() as {
      description?: string;
      images?: string[];
      docType?: string;
      vehicle?: Record<string, unknown>;
    };
    const { description = "", images = [], docType = "Werkstattrechnung", vehicle } = body;

    if (!description.trim() && (!images || images.length === 0)) {
      return new Response(JSON.stringify({ error: "Bitte Beschreibung oder mindestens ein Bild angeben." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY nicht konfiguriert" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const vehicleCtx = vehicle && Object.keys(vehicle).length
      ? `\n\nFahrzeug-Kontext:\n${JSON.stringify(vehicle, null, 2)}`
      : "";

    const sys = `Du bist ein erfahrener Werkstatt- und Karosseriemeister in einem deutschen Wohnmobil-/Fahrzeughandel.
Deine Aufgabe: Aus einer Schadens-/Auftragsbeschreibung und/oder Fotos eine sinnvolle Aufstellung von Rechnungspositionen für eine "${docType}" generieren.

Regeln:
- Trenne Arbeitsleistung (Stunden × Stundensatz, üblich 95-130 €/h) von Material/Ersatzteilen.
- Gib realistische, marktübliche Netto-Einzelpreise in EUR (ohne MwSt.).
- Beschreibungen klar und professionell auf Deutsch, kurz aber konkret (z.B. "Lackieren Seitenwand links inkl. Vorbereitung und Klarlack").
- Falls Bilder vorhanden sind: schätze Schadensumfang realistisch ein (Größe, Tiefe, betroffene Bauteile).
- Liefere 2-6 Positionen, keine Endsumme, keine MwSt-Position.
- Wenn unklar, lieber konservativ schätzen und im 'summary' den Vorbehalt erwähnen.`;

    const userText = `Beschreibung des Auftrags/Schadens:\n${description || "(keine Beschreibung – bitte aus Bildern ableiten)"}${vehicleCtx}`;

    const imageParts = (images ?? []).map((url) => ({ type: "image_url" as const, image_url: { url } }));

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: [{ type: "text", text: userText }, ...imageParts] },
        ],
        tools: [{
          type: "function",
          function: { name: "set_invoice_suggestion", description: "Setzt den Rechnungsvorschlag", parameters: SCHEMA },
        }],
        tool_choice: { type: "function", function: { name: "set_invoice_suggestion" } },
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
