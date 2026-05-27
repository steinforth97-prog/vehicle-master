// CarCutter-style vehicle compositing via Lovable AI Gateway (Gemini image).
// Supports multiple background styles + optional logo branding on the license plate.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Style = "studio" | "neutral" | "outdoor" | "company";

function backgroundClause(style: Style, brightness: number): string {
  const sign = brightness > 0 ? "+" : "";
  switch (style) {
    case "studio":
      return `Place the vehicle inside a clean, photorealistic 3D dealership SHOWROOM:
- bright, evenly lit studio space, soft white/light-grey curved seamless cyclorama wall behind
- polished light concrete/terrazzo floor with a subtle round turntable disc under the vehicle
- soft realistic floor reflection of the vehicle (about 20% opacity, mirrored, fading out)
- soft diffused top light, gentle rim light, no harsh shadows, no visible light sources
- look and feel like CarCutter / professional dealer showroom photography
- background brightness/exposure adjustment ${sign}${brightness}% applied to the studio only.`;
    case "neutral":
      return `Place the vehicle on a clean NEUTRAL studio background:
- seamless light grey (#e9ebee) gradient backdrop, slightly darker at the top, brighter at the bottom
- matte light grey floor, soft contact shadow directly under the vehicle (no floor reflection)
- perfectly even diffused lighting, no visible light sources, no scenery
- classifieds/marketplace style (mobile.de, AutoScout24) catalog photo
- background brightness adjustment ${sign}${brightness}%.`;
    case "outdoor":
      return `Place the vehicle in a clean OUTDOOR location:
- smooth dark asphalt forecourt, slightly wet-look but no puddles, clean and tidy
- soft modern architecture or blurred greenery in the background, shallow depth of field
- bright sunny day, soft sun from the upper left, clear blue sky with a few light clouds
- realistic ground shadow under the vehicle matching the sun direction
- background brightness adjustment ${sign}${brightness}%.`;
    case "company":
      return `Place the vehicle in front of the provided COMPANY BACKGROUND image (Image 2):
- The background MUST stay visually identical to Image 2 (same building, banners, sky, paving).
- Center the vehicle horizontally on the paved forecourt, wheels resting cleanly on the pavement.
- Add a soft realistic ground shadow matching the sunlight direction (sun from upper left).
- Background brightness/exposure adjustment ${sign}${brightness}% applied to the background only.`;
  }
}

function compositePrompt(style: Style, brightness: number, withLogo: boolean): string {
  const bg = backgroundClause(style, brightness);
  const logoImageIndex = style === "company" ? 3 : 2;
  const logoClause = withLogo
    ? `\nLOGO BRANDING (Image ${logoImageIndex}):
- Replace the visible license plate of the vehicle with a clean white rectangular plate of the same shape and perspective.
- Place the provided logo (Image ${logoImageIndex}) CENTERED on that plate, sized to fit with comfortable padding, preserving the logo's original aspect ratio and colors.
- The plate must follow the vehicle's perspective and lighting (subtle shading, no harsh edges).
- If no plate is visible, do NOT add one.`
    : "";

  return `You receive multiple images.
Image 1 = a vehicle photo (motorhome / camper / car).${style === "company" ? "\nImage 2 = a fixed company-entrance background." : ""}${withLogo ? `\nImage ${logoImageIndex} = a company logo (transparent or on white).` : ""}

TASK: Produce ONE photorealistic final photo where the vehicle from Image 1 is CUT OUT pixel-accurately and placed onto the described scene.

${bg}

STRICT VEHICLE RULES (must all be followed):
- TREAT THE VEHICLE AS A CUTOUT: copy the vehicle pixels from Image 1 as faithfully as possible. Do NOT repaint, redesign, restyle, re-color, or "improve" the vehicle. Keep the exact paint, decals, graphics, wheels, mirrors, badges, license plate area, windows and reflections from Image 1. The vehicle in the output must be recognizably the SAME vehicle, not a similar one.
- Keep the EXACT proportions and aspect ratio. Do NOT stretch, squash, skew, tilt or rotate. No perspective distortion. No re-modelling of body shape.
- Cleanly isolate from the original background (remove the old scene completely). No floating parts, no duplicated or missing wheels. No halo, no cutout edges.
- SIZE: the vehicle must be LARGE and prominent in the frame — it should fill roughly 75–90% of the image width and 60–80% of the image height, centered. Do NOT shrink it. Never render it small or far away. The vehicle is the hero of the photo.
- Wheels must rest cleanly on the ground (not floating, not clipping). Add a soft realistic ground shadow.
- Output must look like a single professional photograph, not a collage. No double shadows.
${logoClause}

OUTPUT: a single image at 16:9 aspect ratio with the vehicle dominating the frame.`;
}

const validatePrompt = `You are a strict QA reviewer for a vehicle photo composite (dealer/CarCutter style).
Check and answer in JSON: {"ok": boolean, "issues": string[]}

Set ok=false if ANY of the following is true:
- vehicle is visibly stretched / squashed / distorted (wrong aspect ratio)
- vehicle is floating above the ground or clipping into the ground
- wheels missing, duplicated, deformed, or twisted
- visible cutout edges, halo, double shadow, or obvious collage seams
- vehicle body parts (mirrors, antennas, roof box) are cut off unnaturally
- lighting on vehicle does not match the new scene at all

issues: short German bullet phrases (empty array if ok=true). Return ONLY valid JSON.`;

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
    const {
      vehicleImageBase64,
      backgroundImageBase64,
      logoImageBase64,
      style = "company",
      brightness = 0,
    } = await req.json();

    if (!vehicleImageBase64) {
      return new Response(JSON.stringify({ error: "vehicleImageBase64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const s = (["studio", "neutral", "outdoor", "company"].includes(style) ? style : "company") as Style;
    if (s === "company" && !backgroundImageBase64) {
      return new Response(JSON.stringify({ error: "Firmenhintergrund fehlt — bitte in Einstellungen hochladen oder anderen Stil wählen." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const b = Math.max(-20, Math.min(40, Number(brightness) || 0));
    const withLogo = !!logoImageBase64;

    const content: any[] = [
      { type: "text", text: compositePrompt(s, b, withLogo) },
      { type: "image_url", image_url: { url: vehicleImageBase64 } },
    ];
    if (s === "company") content.push({ type: "image_url", image_url: { url: backgroundImageBase64 } });
    if (withLogo) content.push({ type: "image_url", image_url: { url: logoImageBase64 } });

    const compRes = await callGateway({
      model: "google/gemini-2.5-flash-image",
      modalities: ["image", "text"],
      messages: [{ role: "user", content }],
    });

    if (!compRes.ok) {
      if (compRes.status === 429) {
        return new Response(JSON.stringify({ error: "KI-Limit erreicht — bitte später erneut versuchen." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (compRes.status === 402) {
        return new Response(JSON.stringify({ error: "KI-Guthaben aufgebraucht. Bitte unter Einstellungen → Workspace → Usage aufladen." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await compRes.text();
      console.error("composite error", compRes.status, text);
      return new Response(JSON.stringify({ error: `KI-Fehler (${compRes.status})` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const compData = await compRes.json();
    const url = compData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) {
      console.error("No image returned", JSON.stringify(compData).slice(0, 800));
      return new Response(JSON.stringify({ error: "KI hat kein Bild zurückgegeben" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // QA pass (best-effort)
    let validation: { ok: boolean; issues: string[] } = { ok: true, issues: [] };
    try {
      const vRes = await callGateway({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: validatePrompt },
            { type: "image_url", image_url: { url } },
          ],
        }],
        response_format: { type: "json_object" },
      });
      if (vRes.ok) {
        const vData = await vRes.json();
        const txt: string = vData?.choices?.[0]?.message?.content ?? "";
        const parsed = JSON.parse(txt);
        if (typeof parsed?.ok === "boolean") {
          validation = { ok: parsed.ok, issues: Array.isArray(parsed.issues) ? parsed.issues : [] };
        }
      }
    } catch (e) {
      console.warn("validation skipped", e);
    }

    return new Response(JSON.stringify({ imageBase64: url, validation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("composite-vehicle-bg error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
