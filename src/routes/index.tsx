import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Car as CarIcon } from "lucide-react";
import { STATUS_LABELS, FUEL_LABELS, statusBadgeClass, formatPrice, formatNumber, type VehicleStatus } from "@/lib/vehicles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: () => <AppLayout><VehiclesPage /></AppLayout>,
  head: () => ({ meta: [{ title: "Fahrzeuge — Fleet" }] }),
});

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  mileage: number | null;
  price: number | null;
  purchase_price: number | null;
  fuel: string | null;
  status: VehicleStatus;
  main_image_url: string | null;
  created_at: string;
}

function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");
  const [priceMode, setPriceMode] = useState<"VK" | "EK">("VK");

  useEffect(() => {
    supabase.from("vehicles").select("*").order("created_at", { ascending: false })
      .then(({ data }) => {
        setVehicles((data ?? []) as Vehicle[]);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    let list = vehicles;
    if (statusFilter !== "all") list = list.filter(v => v.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v => `${v.brand} ${v.model}`.toLowerCase().includes(q));
    }
    const sorted = [...list];
    const priceOf = (v: Vehicle) => (priceMode === "VK" ? v.price : v.purchase_price) ?? 0;
    if (sort === "price_asc") sorted.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === "price_desc") sorted.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sort === "mileage_asc") sorted.sort((a, b) => (a.mileage ?? 0) - (b.mileage ?? 0));
    return sorted;
  }, [vehicles, search, statusFilter, sort, priceMode]);

  const counts = useMemo(() => ({
    total: vehicles.length,
    verfuegbar: vehicles.filter(v => v.status === "verfuegbar").length,
    reserviert: vehicles.filter(v => v.status === "reserviert").length,
    verkauft: vehicles.filter(v => v.status === "verkauft").length,
  }), [vehicles]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Fahrzeuge</h1>
          <p className="text-sm text-muted-foreground mt-1">{counts.total} Fahrzeuge im Bestand</p>
        </div>
        <Button asChild>
          <Link to="/fahrzeuge/neu"><Plus className="h-4 w-4 mr-1" /> Neues Fahrzeug</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Bestand", value: counts.total, key: "all" },
          { label: "Verfügbar", value: counts.verfuegbar, key: "verfuegbar" },
          { label: "Reserviert", value: counts.reserviert, key: "reserviert" },
          { label: "Verkauft", value: counts.verkauft, key: "verkauft" },
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

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Marke, Modell suchen…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Neueste zuerst</SelectItem>
            <SelectItem value="price_asc">Preis aufsteigend</SelectItem>
            <SelectItem value="price_desc">Preis absteigend</SelectItem>
            <SelectItem value="mileage_asc">KM aufsteigend</SelectItem>
          </SelectContent>
        </Select>
        <div
          role="switch"
          aria-checked={priceMode === "EK"}
          onClick={() => setPriceMode(priceMode === "VK" ? "EK" : "VK")}
          className="relative inline-flex h-10 w-[120px] cursor-pointer items-center rounded-md border bg-muted/40 p-1 select-none"
          title="Zwischen Verkaufs- und Einkaufspreis wechseln"
        >
          <div
            className={cn(
              "absolute top-1 bottom-1 w-[56px] rounded-sm bg-card shadow-sm border transition-all",
              priceMode === "VK" ? "left-1" : "left-[60px]"
            )}
          />
          <div className="relative z-10 flex w-full text-xs font-semibold">
            <span className={cn("flex-1 text-center", priceMode === "VK" ? "text-foreground" : "text-muted-foreground")}>VK</span>
            <span className={cn("flex-1 text-center", priceMode === "EK" ? "text-foreground" : "text-muted-foreground")}>EK</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Lädt…</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <CarIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium mb-1">Keine Fahrzeuge gefunden</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {vehicles.length === 0 ? "Lege dein erstes Fahrzeug an." : "Passe deine Filter an."}
          </p>
          {vehicles.length === 0 && (
            <Button asChild><Link to="/fahrzeuge/neu"><Plus className="h-4 w-4 mr-1" /> Fahrzeug anlegen</Link></Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Fahrzeug</th>
                  <th className="text-left font-medium px-4 py-3">Baujahr</th>
                  <th className="text-right font-medium px-4 py-3">KM</th>
                  <th className="text-left font-medium px-4 py-3">Kraftstoff</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-right font-medium px-4 py-3">{priceMode === "VK" ? "Preis (VK)" : "Einkauf (EK)"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => (
                  <tr
                    key={v.id}
                    onClick={() => { window.location.href = `/fahrzeuge/${v.id}`; }}
                    className="border-t cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link to="/fahrzeuge/$id" params={{ id: v.id }} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {v.brand} {v.model}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{v.year ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatNumber(v.mileage)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.fuel ? FUEL_LABELS[v.fuel as keyof typeof FUEL_LABELS] : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-1 rounded border", statusBadgeClass(v.status))}>
                        {STATUS_LABELS[v.status]}
                      </span>
                    </td>
                    <td className={cn("px-4 py-3 text-right font-semibold", priceMode === "EK" && "text-amber-600 dark:text-amber-400")}>
                      {formatPrice(priceMode === "VK" ? v.price : v.purchase_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
