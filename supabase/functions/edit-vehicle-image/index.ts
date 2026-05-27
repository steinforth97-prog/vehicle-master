// Edit vehicle images via Lovable AI Gateway (Nano Banana / Gemini image edit).
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Op = "inpaint" | "auto_enhance" | "remove_background" | "blur_plate" | "custom";

function buildPrompt(op: Op, userPrompt?: string): string {
  switch (op) {
    case "inpaint":
      return `You are editing a car photo. The second image is a binary mask: WHITE pixels mark the region to MODIFY, BLACK pixels must remain pixel-identical to the original. Replace ONLY the white-masked region with: ${userPrompt || "a clean, photorealistic continuation of the surrounding background, seamlessly blended"}. Match lighting, perspective, color and texture exactly. Do not alter anything outside the mask. Output the full original image with only the masked region modified.`;
    case "auto_enhance":
      return "Auto-enhance this car photograph for a professional dealer listing: improve exposure, contrast, white balance, color vibrance and sharpness. Keep the car shape, geometry, license plate and background unchanged. Subtle and natural — not over-processed.";
    case "remove_background":
      return "Replace the background of this car photo with a clean, neutral light-grey studio background with a soft floor reflection under the car. Keep the car perfectly intact, including shadows under the wheels.";
    case "blur_plate":
      return "Find every license plate on this car and replace it with a strong blur / pixelation so the text is unreadable. Do not modify anything else.";
    case "custom":
      return userPrompt || "Improve this car photo.";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { imageBase64, maskBase64, operation, prompt } = await req.json();
    if (!imageBase64 || !operation) {
      return new Response(JSON.stringify({ error: "imageBase64 and operation are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const op = operation as Op;
    const finalPrompt = buildPrompt(op, prompt);
    const content: any[] = [
      { type: "text", text: finalPrompt },
      { type: "image_url", image_url: { url: imageBase64 } },
    ];
    if (op === "inpaint" && maskBase64) {
      content.push({ type: "image_url", image_url: { url: maskBase64 } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [{ role: "user", content }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "KI-Limit erreicht — bitte später erneut versuchen." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "KI-Guthaben aufgebraucht. Bitte unter Einstellungen → Workspace → Usage aufladen." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error", response.status, text);
      return new Response(JSON.stringify({ error: `KI-Fehler (${response.status})` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
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
    console.error("edit-vehicle-image error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
