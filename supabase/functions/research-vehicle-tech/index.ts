// Edge function: recherchiert technische Fahrzeugdetails via Lovable AI Gateway
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TECH_SCHEMA = {
  type: "object",
  properties: {
    assumed_generation: { type: "string", description: "Welche Modellgeneration / Baureihe wurde der Antwort zugrunde gelegt (z.B. 'BMW E90 LCI 2008-2011'). Falls unklar: 'unbekannt'." },
    engine_code: { type: "string", description: "Motorkennbuchstabe / Motorcode (z.B. 'N47D20', 'CAYC'). 'unbekannt' wenn unsicher." },
    timing_drive: { type: "string", enum: ["steuerkette", "zahnriemen", "koenigswelle", "gemischt", "unbekannt"], description: "Antrieb der Nockenwelle." },
    timing_interval_km: { type: "integer", description: "Wechselintervall in km (nur bei Zahnriemen, sonst 0)." },
    timing_interval_years: { type: "integer", description: "Wechselintervall in Jahren (nur bei Zahnriemen, sonst 0)." },
    timing_notes: { type: "string", description: "Zusatzinfo zu Steuertrieb / Schwachstellen, Wechselempfehlung." },
    cylinders: { type: "integer", description: "Zylinderzahl, 0 wenn unbekannt." },
    aspiration: { type: "string", enum: ["sauger", "turbo", "kompressor", "biturbo", "elektrisch", "unbekannt"] },
    injection: { type: "string", description: "Einspritzungsart (z.B. 'Direkteinspritzung', 'Saugrohreinspritzung'). 'unbekannt' wenn unsicher." },
    oil_spec: { type: "string", description: "Empfohlene Öl-Spezifikation (z.B. '5W-30 LongLife-04')." },
    oil_capacity_l: { type: "number", description: "Ölfüllmenge in Litern (mit Filter), 0 wenn unbekannt." },
    service_interval_km: { type: "integer", description: "Service-Intervall km, 0 wenn unbekannt." },
    service_interval_months: { type: "integer", description: "Service-Intervall Monate, 0 wenn unbekannt." },
    common_issues: { type: "array", items: { type: "string" }, description: "Typische Schwachstellen / bekannte Probleme dieser Motor-/Fahrzeuggeneration. Kurze Stichpunkte." },
    notes: { type: "string", description: "Sonstige Hinweise, falls relevant." },
  },
  required: ["assumed_generation", "timing_drive", "common_issues"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vehicle } = await req.json();
    if (!vehicle?.brand || !vehicle?.model) {
      return new Response(JSON.stringify({ error: "vehicle.brand und vehicle.model sind erforderlich" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY nicht konfiguriert" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userPrompt = `Recherchiere die typischen technischen Eckdaten für folgendes Fahrzeug:
- Marke: ${vehicle.brand}
- Modell / Inserat: ${vehicle.model}
- Baujahr: ${vehicle.year ?? "unbekannt"}
- Erstzulassung: ${vehicle.first_registration ?? "unbekannt"}
- Kraftstoff: ${vehicle.fuel ?? "unbekannt"}
- Leistung: ${vehicle.power_kw ?? "?"} kW / ${vehicle.power_hp ?? "?"} PS
- Hubraum: ${vehicle.displacement_cc ?? "?"} cm³
- Getriebe: ${vehicle.transmission ?? "unbekannt"}

Gib für die Generation, die am besten zu diesen Daten passt, die typischen Werte zurück. Wenn etwas unsicher ist, lieber 'unbekannt' bzw. 0 zurückgeben statt zu raten.`;

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
            content: "Du bist ein erfahrener Kfz-Meister und Fahrzeug-Datenbank-Experte. Du lieferst sachliche, konservative technische Informationen zu Fahrzeugen auf Basis öffentlich bekannter Hersteller- und Werkstattdaten. Antworte ausschließlich auf Deutsch. Wenn ein Wert nicht zuverlässig bekannt ist, gib 'unbekannt' (Strings) bzw. 0 (Zahlen) zurück und rate nicht. Nenne typische Schwachstellen knapp und faktisch.",
          },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "set_tech_details",
            description: "Liefert die recherchierten technischen Fahrzeugdetails",
            parameters: TECH_SCHEMA,
          },
        }],
        tool_choice: { type: "function", function: { name: "set_tech_details" } },
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
