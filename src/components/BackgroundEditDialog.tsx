import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const PRESETS = [
  { label: "Heller & sonniger", prompt: "Brighten the scene moderately, even sunny daylight, lift shadows, clean blue sky, no overexposure." },
  { label: "Goldene Stunde", prompt: "Warm golden-hour lighting, soft warm sun from the side, slightly longer shadows, warm color grading." },
  { label: "Bewölkt, neutral", prompt: "Soft overcast diffused daylight, neutral white balance, no harsh shadows, clean even exposure." },
  { label: "Boden gereinigt", prompt: "Clean the paved forecourt: remove dirt, stains, puddles and debris. Keep the surface and texture the same." },
  { label: "Frischer Look", prompt: "Slightly increase contrast and clarity, cleaner colors, crisp but natural — like a polished real-estate photo." },
];

async function urlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function BackgroundEditDialog({
  open, onOpenChange, currentUrl, kind, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUrl: string;
  kind: "auto" | "wohnmobil";
  onSaved: (url: string, path: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [resultB64, setResultB64] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    if (!prompt.trim()) {
      toast.error("Bitte gewünschte Änderungen beschreiben.");
      return;
    }
    setGenerating(true);
    setResultB64(null);
    try {
      const backgroundImageBase64 = await urlToBase64(currentUrl);
      const { data, error } = await supabase.functions.invoke("edit-background-image", {
        body: { backgroundImageBase64, prompt: prompt.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResultB64((data as any).imageBase64);
    } catch (e: any) {
      toast.error(e.message ?? "Generieren fehlgeschlagen");
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!resultB64) return;
    setSaving(true);
    try {
      const blob = await (await fetch(resultB64)).blob();
      const path = `background-${kind}-${Date.now()}.png`;
      const { error } = await supabase.storage.from("company-assets").upload(path, blob, {
        upsert: true, contentType: blob.type || "image/png",
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("company-assets").getPublicUrl(path);
      onSaved(pub.publicUrl, path);
      toast.success("Neuer Hintergrund übernommen – nicht vergessen zu speichern");
      onOpenChange(false);
      setResultB64(null);
      setPrompt("");
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" /> Hintergrund mit KI bearbeiten
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Original</Label>
            <img src={currentUrl} alt="Original" className="mt-1 w-full rounded border object-cover aspect-video" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Ergebnis</Label>
            <div className="mt-1 w-full rounded border bg-muted aspect-video overflow-hidden flex items-center justify-center">
              {generating ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : resultB64 ? (
                <img src={resultB64} alt="Ergebnis" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">Noch nichts generiert</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Vorlagen</Label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <Button key={p.label} type="button" variant="outline" size="sm"
                onClick={() => setPrompt(p.prompt)}>
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Anweisung (frei formuliert, Deutsch oder Englisch)</Label>
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            placeholder="z. B. heller machen, Himmel klarer, Boden reinigen, sonnige Mittagsstimmung…"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating || saving}>
            Abbrechen
          </Button>
          <Button onClick={generate} disabled={generating || saving} variant="secondary">
            {generating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generiert…</> : <><Wand2 className="h-4 w-4 mr-1" /> Generieren</>}
          </Button>
          <Button onClick={save} disabled={!resultB64 || saving}>
            {saving ? "Speichert…" : "Übernehmen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
