import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Plus, Search, Caravan, FileText, Eye, Download } from "lucide-react";
import { STATUS_LABELS, statusBadgeClass, formatPrice, formatNumber, type VehicleStatus } from "@/lib/vehicles";
import { BODY_TYPE_LABELS, type MotorhomeBodyType } from "@/lib/motorhomes";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExternalInvoiceDialog, EXTERNAL_INVOICE_LABELS, type ExternalInvoiceType } from "@/components/ExternalInvoiceDialog";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/wohnmobile/")({
  component: () => <AppLayout><MotorhomesPage /></AppLayout>,
  head: () => ({ meta: [{ title: "Wohnmobile — Fleet" }] }),
});

interface Motorhome {
  id: string; brand: string; model: string; year: number | null; mileage: number | null;
  price: number | null; purchase_price: number | null; sale_price: number | null; body_type: MotorhomeBodyType | null;
  status: VehicleStatus; main_image_url: string | null;
}

interface ExternalInvoice {
  id: string;
  type: ExternalInvoiceType;
  document_number: string | null;
  invoice_date: string;
  customer_name: string | null;
  vehicle: any;
  total_amount: number | null;
  url: string | null;
  created_at: string;
}

function MotorhomesPage() {
  const [items, setItems] = useState<Motorhome[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    supabase.from("motorhomes").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setItems((data ?? []) as Motorhome[]); setLoading(false); });
  }, []);

  const bestandItems = useMemo(() => items.filter(v => v.status !== "verkauft"), [items]);
  const verkaufteItems = useMemo(() => items.filter(v => v.status === "verkauft"), [items]);

  const filtered = useMemo(() => {
    let l = bestandItems;
    if (statusFilter !== "all") l = l.filter(v => v.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      l = l.filter(v => `${v.brand} ${v.model}`.toLowerCase().includes(q));
    }
    return l;
  }, [bestandItems, search, statusFilter]);

  const verkauftFiltered = useMemo(() => {
    if (!search.trim()) return verkaufteItems;
    const q = search.toLowerCase();
    return verkaufteItems.filter(v => `${v.brand} ${v.model}`.toLowerCase().includes(q));
  }, [verkaufteItems, search]);

  const counts = useMemo(() => ({
    total: bestandItems.length,
    verfuegbar: items.filter(v => v.status === "verfuegbar").length,
    reserviert: items.filter(v => v.status === "reserviert").length,
    verkauft: verkaufteItems.length,
  }), [items, bestandItems, verkaufteItems]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Wohnmobile</h1>
          <p className="text-sm text-muted-foreground mt-1">{counts.total} Wohnmobile im Bestand</p>
        </div>
      </div>

      <Tabs defaultValue="bestand" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="bestand">Bestand</TabsTrigger>
          <TabsTrigger value="verkauft">Verkauft</TabsTrigger>
          <TabsTrigger value="fremdkunden">Fremdkunden-Rechnungen</TabsTrigger>
        </TabsList>

        <TabsContent value="bestand" className="space-y-6">
          <div className="flex justify-end">
            <Button asChild>
              <Link to="/wohnmobile/neu"><Plus className="h-4 w-4 mr-1" /> Neues Wohnmobil</Link>
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "Bestand", value: counts.total, key: "all" },
              { label: "Verfügbar", value: counts.verfuegbar, key: "verfuegbar" },
              { label: "Reserviert", value: counts.reserviert, key: "reserviert" },
            ].map(s => (
              <button key={s.label} onClick={() => setStatusFilter(s.key)} className={cn(
                "text-left rounded-lg border p-4 bg-card transition-colors",
                statusFilter === s.key ? "border-accent ring-1 ring-accent" : "hover:border-foreground/20"
              )}>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-2xl font-semibold mt-1">{s.value}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Marke, Modell suchen…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Lädt…</div>
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center">
              <Caravan className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-1">Keine Wohnmobile gefunden</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {items.length === 0 ? "Lege dein erstes Wohnmobil an." : "Passe deine Filter an."}
              </p>
              {items.length === 0 && (
                <Button asChild><Link to="/wohnmobile/neu"><Plus className="h-4 w-4 mr-1" /> Wohnmobil anlegen</Link></Button>
              )}
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-4 py-3">Wohnmobil</th>
                      <th className="text-left font-medium px-4 py-3">Aufbau</th>
                      <th className="text-left font-medium px-4 py-3">Baujahr</th>
                      <th className="text-right font-medium px-4 py-3">KM</th>
                      <th className="text-left font-medium px-4 py-3">Status</th>
                      <th className="text-right font-medium px-4 py-3">Preis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(v => (
                      <tr key={v.id}
                        onClick={() => { window.location.href = `/wohnmobile/${v.id}`; }}
                        className="border-t cursor-pointer hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <Link to="/wohnmobile/$id" params={{ id: v.id }} className="hover:underline" onClick={e => e.stopPropagation()}>
                            {v.brand} {v.model}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{v.body_type ? BODY_TYPE_LABELS[v.body_type] : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{v.year ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatNumber(v.mileage)}</td>
                        <td className="px-4 py-3">
                          <span className={cn("text-xs px-2 py-1 rounded border", statusBadgeClass(v.status))}>
                            {STATUS_LABELS[v.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatPrice(v.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="verkauft" className="space-y-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Marke, Modell suchen…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Lädt…</div>
          ) : verkauftFiltered.length === 0 ? (
            <Card className="p-12 text-center">
              <Caravan className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-1">Noch keine verkauften Wohnmobile</h3>
              <p className="text-sm text-muted-foreground">Wohnmobile mit Status „Verkauft" erscheinen hier.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left font-medium px-4 py-3">Wohnmobil</th>
                      <th className="text-left font-medium px-4 py-3">Aufbau</th>
                      <th className="text-left font-medium px-4 py-3">Baujahr</th>
                      <th className="text-right font-medium px-4 py-3">KM</th>
                      <th className="text-right font-medium px-4 py-3">Listenpreis</th>
                      <th className="text-right font-medium px-4 py-3">VK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verkauftFiltered.map(v => (
                      <tr key={v.id}
                        onClick={() => { window.location.href = `/wohnmobile/${v.id}`; }}
                        className="border-t cursor-pointer hover:bg-muted/40 transition-colors">
                        <td className="px-4 py-3 font-medium">
                          <Link to="/wohnmobile/$id" params={{ id: v.id }} className="hover:underline" onClick={e => e.stopPropagation()}>
                            {v.brand} {v.model}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{v.body_type ? BODY_TYPE_LABELS[v.body_type] : "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{v.year ?? "—"}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatNumber(v.mileage)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{formatPrice(v.price)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-accent">{formatPrice(v.sale_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="fremdkunden">
          <ExternalInvoicesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExternalInvoicesTab() {
  const [invoices, setInvoices] = useState<ExternalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    supabase.from("external_invoices").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setInvoices((data ?? []) as any); setLoading(false); });
  };

  useEffect(() => {
    load();
    supabase.from("company_settings").select("*").eq("kind", "wohnmobil").maybeSingle()
      .then(({ data }) => {
        if (data) { setCompany(data); return; }
        supabase.from("company_settings").select("*").eq("kind", "auto").maybeSingle()
          .then(({ data: d2 }) => setCompany(d2));
      });
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return invoices;
    const q = search.toLowerCase();
    return invoices.filter(i =>
      (i.customer_name ?? "").toLowerCase().includes(q) ||
      (i.document_number ?? "").toLowerCase().includes(q) ||
      `${i.vehicle?.brand ?? ""} ${i.vehicle?.model ?? ""}`.toLowerCase().includes(q),
    );
  }, [invoices, search]);

  const openDialog = () => {
    if (!company) {
      toast.error("Bitte zuerst Firmendaten in den Einstellungen anlegen.");
      return;
    }
    setShowDialog(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Rechnungen für Fremdkunden</h2>
          <p className="text-sm text-muted-foreground">
            Werkstatt, Dichtigkeitsprüfung, freie Rechnungen und Kommissionsverkäufe.
          </p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="h-4 w-4 mr-1" /> Neue Rechnung
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Kunde, Belegnr., Fahrzeug…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Lädt…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium mb-1">Noch keine Fremdkunden-Rechnungen</h3>
          <p className="text-sm text-muted-foreground mb-4">Lege deine erste Rechnung für einen Fremdkunden an.</p>
          <Button onClick={openDialog}><Plus className="h-4 w-4 mr-1" /> Rechnung erstellen</Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Datum</th>
                  <th className="text-left font-medium px-4 py-3">Belegnr.</th>
                  <th className="text-left font-medium px-4 py-3">Art</th>
                  <th className="text-left font-medium px-4 py-3">Kunde</th>
                  <th className="text-left font-medium px-4 py-3">Fahrzeug</th>
                  <th className="text-right font-medium px-4 py-3">Betrag</th>
                  <th className="text-right font-medium px-4 py-3">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id} className="border-t hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{i.invoice_date}</td>
                    <td className="px-4 py-3 font-mono text-xs">{i.document_number ?? "—"}</td>
                    <td className="px-4 py-3">{EXTERNAL_INVOICE_LABELS[i.type]}</td>
                    <td className="px-4 py-3">{i.customer_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[i.vehicle?.brand, i.vehicle?.model].filter(Boolean).join(" ") || "—"}
                      {i.vehicle?.license_plate ? ` · ${i.vehicle.license_plate}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{i.total_amount != null ? formatPrice(i.total_amount) : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {i.url && (
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => setPreviewUrl(i.url)} title="Vorschau">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" asChild title="Herunterladen">
                            <a href={i.url} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a>
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {showDialog && company && (
        <ExternalInvoiceDialog
          company={company}
          onClose={() => setShowDialog(false)}
          onSaved={load}
        />
      )}

      {previewUrl && (
        <PrintPreviewDialog
          open
          onClose={() => setPreviewUrl(null)}
          source={{ url: previewUrl }}
          title="Rechnungsvorschau"
        />
      )}
    </div>
  );
}
