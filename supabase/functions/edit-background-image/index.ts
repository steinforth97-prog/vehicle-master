// AI-edit the company background image via Lovable AI Gateway (Gemini image).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildPrompt(userPrompt: string): string {
  return `You receive ONE image: a company-entrance / forecourt photo used as a fixed background for vehicle compositions.

TASK: Re-render this exact scene with the following user-requested changes:
"${userPrompt}"

STRICT RULES:
- Keep the SAME building, signage, lettering, banners, layout, perspective and camera angle. Do NOT replace, restyle or move the building or signage.
- Keep the same aspect ratio and framing as the input.
- Apply ONLY the requested adjustments (e.g. lighting, exposure, sky, weather, cleanliness, color grading, time of day).
- Do NOT add vehicles, people, text overlays or watermarks unless explicitly requested.
- Output must look like a single natural photograph of the same place — no collage, no cartoon, no painting style unless requested.
- Output exactly ONE image.`;
}

async function callGateway(body: unknown) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { backgroundImageBase64, prompt } = await req.json();
    if (!backgroundImageBase64 || !prompt) {
      return new Response(JSON.stringify({ error: "backgroundImageBase64 and prompt are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await callGateway({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [{
        role: "user",
        content: [
          { type: "text", text: buildPrompt(String(prompt).slice(0, 800)) },
          { type: "image_url", image_url: { url: backgroundImageBase64 } },
        ],
      }],
    });

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "KI-Limit erreicht — bitte später erneut versuchen." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "KI-Guthaben aufgebraucht. Bitte unter Einstellungen → Workspace → Usage aufladen." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await res.text();
      console.error("edit-background error", res.status, text);
      return new Response(JSON.stringify({ error: `KI-Fehler (${res.status})` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) {
      console.error("No image returned", JSON.stringify(data).slice(0, 800));
      return new Response(JSON.stringify({ error: "KI hat kein Bild zurückgegeben" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ imageBase64: url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("edit-background-image error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
