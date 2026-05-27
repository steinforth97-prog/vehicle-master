import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, Trash2, Loader2 } from "lucide-react";
import { STATUS_LABELS, FUEL_LABELS, TRANSMISSION_LABELS, statusBadgeClass, formatNumber, formatPrice, type VehicleStatus } from "@/lib/vehicles";
import { BODY_TYPE_LABELS, type MotorhomeBodyType } from "@/lib/motorhomes";
import { MotorhomeGallery } from "@/components/MotorhomeGallery";
import { MotorhomeDocuments } from "@/components/MotorhomeDocuments";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/wohnmobile/$id/")({
  component: () => {
    const { id } = Route.useParams();
    return <AppLayout><MotorhomeDetailPage id={id} /></AppLayout>;
  },
});

function MotorhomeDetailPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const [m, setM] = useState<any>(null);
  const [company, setCompany] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { reload(); }, [id]);

  const reload = async () => {
    const [mRes, cRes] = await Promise.all([
      supabase.from("motorhomes").select("*").eq("id", id).single(),
      supabase.from("company_settings").select("*").eq("kind", "wohnmobil").maybeSingle(),
    ]);
    setM(mRes.data);
    setCompany(cRes.data ?? {});
    setLoading(false);
  };

  const updateStatus = async (s: VehicleStatus) => {
    await supabase.from("motorhomes").update({ status: s }).eq("id", id);
    setM({ ...m, status: s });
    toast.success("Status aktualisiert");
  };

  const remove = async () => {
    if (!confirm("Wohnmobil wirklich löschen?")) return;
    await supabase.from("motorhomes").delete().eq("id", id);
    toast.success("Gelöscht");
    navigate({ to: "/wohnmobile" });
  };

  if (loading) return <div className="p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!m) return <div className="p-10">Wohnmobil nicht gefunden.</div>;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <Link to="/wohnmobile" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Zurück zur Übersicht
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className={cn("text-xs px-2 py-0.5 rounded border", statusBadgeClass(m.status))}>
              {STATUS_LABELS[m.status as VehicleStatus]}
            </span>
            {m.body_type && <span className="text-xs text-muted-foreground">{BODY_TYPE_LABELS[m.body_type as MotorhomeBodyType]}</span>}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{m.brand} {m.model}</h1>
          <div className="text-2xl font-semibold mt-2 text-accent">{formatPrice(m.price)}</div>
          {m.sale_price != null && (
            <div className="text-sm mt-1">Tatsächlicher VK: <span className="font-semibold">{formatPrice(m.sale_price)}</span></div>
          )}
          {company.company_name && (
            <div className="text-xs text-muted-foreground mt-1">Rechnungssteller: {company.company_name}</div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={m.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link to="/wohnmobile/$id/bearbeiten" params={{ id }}><Edit className="h-4 w-4 mr-1" /> Bearbeiten</Link>
          </Button>
          <Button variant="outline" onClick={remove}><Trash2 className="h-4 w-4 mr-1" /> Löschen</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <MotorhomeGallery motorhomeId={id} mainImageUrl={m.main_image_url} />
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold mb-4">Wohnmobil-Daten</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Spec label="Aufbau" value={m.body_type ? BODY_TYPE_LABELS[m.body_type as MotorhomeBodyType] : null} />
              <Spec label="Schlafplätze" value={m.sleeping_places} />
              <Spec label="Sitzplätze" value={m.sitting_places} />
              <Spec label="Länge" value={m.length_mm ? `${m.length_mm} mm` : null} />
              <Spec label="Breite" value={m.width_mm ? `${m.width_mm} mm` : null} />
              <Spec label="Höhe" value={m.height_mm ? `${m.height_mm} mm` : null} />
              <Spec label="Zul. Gesamtgewicht" value={m.gross_weight_kg ? `${m.gross_weight_kg} kg` : null} />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-semibold mb-4">Technische Daten</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Spec label="Baujahr" value={m.year} />
              <Spec label="Erstzulassung" value={m.first_registration} />
              <Spec label="Kilometer" value={m.mileage != null ? `${formatNumber(m.mileage)} km` : null} />
              <Spec label="Kraftstoff" value={m.fuel ? FUEL_LABELS[m.fuel as keyof typeof FUEL_LABELS] : null} />
              <Spec label="Getriebe" value={m.transmission ? TRANSMISSION_LABELS[m.transmission as keyof typeof TRANSMISSION_LABELS] : null} />
              <Spec label="Leistung" value={m.power_hp ? `${m.power_hp} PS / ${m.power_kw ?? "—"} kW` : null} />
              <Spec label="Hubraum" value={m.displacement_cc ? `${m.displacement_cc} cm³` : null} />
              <Spec label="Farbe" value={m.color} />
              <Spec label="VIN" value={m.vin} className="col-span-2 md:col-span-3" />
            </div>
          </Card>

          {m.features && m.features.length > 0 && (
            <Card className="p-6">
              <h2 className="font-semibold mb-4">Ausstattung</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                {m.features.map((f: string, i: number) => <div key={i}>• {f}</div>)}
              </div>
            </Card>
          )}

          {m.notes && (
            <Card className="p-6">
              <h2 className="font-semibold mb-2">Interne Notizen</h2>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{m.notes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <MotorhomeDocuments motorhomeId={id} />
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value, className }: { label: string; value: any; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value ?? "—"}</div>
    </div>
  );
}
