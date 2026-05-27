export type VehicleStatus = "verfuegbar" | "reserviert" | "verkauft";
export type FuelType = "benzin" | "diesel" | "elektro" | "hybrid" | "lpg" | "cng" | "wasserstoff";
export type TransmissionType = "manuell" | "automatik" | "halbautomatik";

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  verfuegbar: "Verfügbar",
  reserviert: "Reserviert",
  verkauft: "Verkauft",
};

export const FUEL_LABELS: Record<FuelType, string> = {
  benzin: "Benzin",
  diesel: "Diesel",
  elektro: "Elektro",
  hybrid: "Hybrid",
  lpg: "LPG",
  cng: "CNG",
  wasserstoff: "Wasserstoff",
};

export const TRANSMISSION_LABELS: Record<TransmissionType, string> = {
  manuell: "Manuell",
  automatik: "Automatik",
  halbautomatik: "Halbautomatik",
};

export function statusBadgeClass(s: VehicleStatus): string {
  switch (s) {
    case "verfuegbar": return "bg-success/15 text-success border-success/30";
    case "reserviert": return "bg-warning/20 text-warning-foreground border-warning/40";
    case "verkauft": return "bg-muted text-muted-foreground border-border";
  }
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("de-DE").format(n);
}
