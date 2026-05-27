import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Sparkles, Save, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";

type Vehicle = {
  id: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  first_registration?: string | null;
  fuel?: string | null;
  power_kw?: number | null;
  power_hp?: number | null;
  displacement_cc?: number | null;
  transmission?: string | null;
  tech_details?: TechDetails | null;
  tech_details_updated_at?: string | null;
};

export type TechDetails = {
  assumed_generation?: string;
  engine_code?: string;
  timing_drive?: "steuerkette" | "zahnriemen" | "koenigswelle" | "gemischt" | "unbekannt";
  timing_interval_km?: number;
  timing_interval_years?: number;
  timing_notes?: string;
  cylinders?: number;
  aspiration?: string;
  injection?: string;
  oil_spec?: string;
  oil_capacity_l?: number;
  service_interval_km?: number;
  service_interval_months?: number;
  common_issues?: string[];
  notes?: string;
};

const TIMING_LABEL: Record<string, string> = {
  steuerkette: "Steuerkette",
  zahnriemen: "Zahnriemen",
  koenigswelle: "Königswelle",
  gemischt: "gemischt (Kette + Riemen)",
  unbekannt: "unbekannt",
};

function fmtNum(n?: number, suffix = "") {
  if (!n || n === 0) return null;
  return `${n.toLocaleString("de-DE")}${suffix}`;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value || value === "unbekannt") return null;
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1.5 text-sm border-b border-border/40 last:border-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

export function VehicleTechDetails({ vehicle, onUpdated }: { vehicle: Vehicle; onUpdated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<TechDetails | null>(null);

  const current: TechDetails | null = draft ?? vehicle.tech_details ?? null;
  const isDraft = !!draft;

  const research = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("research-vehicle-tech", {
        body: {
          vehicle: {
            brand: vehicle.brand,
            model: vehicle.model,
            year: vehicle.year,
            first_registration: vehicle.first_registration,
            fuel: vehicle.fuel,
            power_kw: vehicle.power_kw,
            power_hp: vehicle.power_hp,
            displacement_cc: vehicle.displacement_cc,
            transmission: vehicle.transmission,
          },
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const result = (data as any)?.data as TechDetails;
      if (!result) throw new Error("Keine Daten erhalten");
      setDraft(result);
      toast.success("Recherche abgeschlossen – bitte prüfen und übernehmen");
    } catch (e: any) {
      const msg = e?.message ?? "Recherche fehlgeschlagen";
      if (msg.includes("Rate limit")) toast.error("KI-Limit erreicht, bitte später erneut versuchen.");
      else if (msg.includes("Guthaben")) toast.error("Lovable AI Guthaben aufgebraucht. Bitte aufladen.");
      else toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const { error } = await supabase
      .from("vehicles")
      .update({ tech_details: draft as any, tech_details_updated_at: new Date().toISOString() } as any)
      .eq("id", vehicle.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft(null);
    toast.success("Technische Details gespeichert");
    onUpdated();
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            Technische Details (KI-Recherche)
          </h2>
          {vehicle.tech_details_updated_at && !isDraft && (
            <div className="text-xs text-muted-foreground mt-1">
              Zuletzt aktualisiert: {new Date(vehicle.tech_details_updated_at).toLocaleString("de-DE")}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Übernehmen
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={research} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : current ? <RefreshCw className="h-4 w-4 mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
            {current ? "Erneut recherchieren" : "Recherchieren"}
          </Button>
        </div>
      </div>

      {!current && !loading && (
        <p className="text-sm text-muted-foreground">
          Klicke auf „Recherchieren", um typische Motordaten, Steuerkette/Zahnriemen-Info, Wartungsintervalle und bekannte Schwachstellen für dieses Fahrzeug per KI nachzuschlagen.
        </p>
      )}

      {loading && !current && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> KI recherchiert technische Daten …
        </div>
      )}

      {current && (
        <>
          {isDraft && (
            <div className="mb-3 flex gap-2 items-start text-xs bg-accent/10 border border-accent/30 rounded p-2">
              <Info className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Vorschau – noch nicht gespeichert. Mit „Übernehmen" wird das Ergebnis am Fahrzeug gespeichert.</span>
            </div>
          )}

          <div className="space-y-0">
            <Row label="Angenommene Generation" value={current.assumed_generation} />
            <Row label="Motorcode" value={current.engine_code} />
            <Row label="Steuertrieb" value={current.timing_drive ? TIMING_LABEL[current.timing_drive] : undefined} />
            <Row
              label="Wechselintervall"
              value={
                current.timing_drive === "zahnriemen"
                  ? [fmtNum(current.timing_interval_km, " km"), fmtNum(current.timing_interval_years, " Jahre")].filter(Boolean).join(" / ") || null
                  : null
              }
            />
            <Row label="Hinweise Steuertrieb" value={current.timing_notes} />
            <Row label="Zylinder" value={fmtNum(current.cylinders)} />
            <Row label="Aufladung" value={current.aspiration} />
            <Row label="Einspritzung" value={current.injection} />
            <Row label="Öl-Spezifikation" value={current.oil_spec} />
            <Row label="Ölfüllmenge" value={fmtNum(current.oil_capacity_l, " l")} />
            <Row
              label="Service-Intervall"
              value={[fmtNum(current.service_interval_km, " km"), fmtNum(current.service_interval_months, " Monate")].filter(Boolean).join(" / ") || null}
            />
          </div>

          {current.common_issues && current.common_issues.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-1">Typische Schwachstellen</div>
              <ul className="text-sm list-disc pl-5 space-y-0.5 text-muted-foreground">
                {current.common_issues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            </div>
          )}

          {current.notes && (
            <div className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{current.notes}</div>
          )}

          <div className="mt-4 text-xs text-muted-foreground border-t pt-2">
            ⚠️ KI-generiert, ohne Gewähr. Bitte mit Hersteller-/Werkstattangaben abgleichen.
          </div>
        </>
      )}
    </Card>
  );
}
