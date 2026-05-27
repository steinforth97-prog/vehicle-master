export type MotorhomeBodyType = "alkoven" | "teilintegriert" | "vollintegriert" | "kastenwagen";
export type MotorhomeDocType =
  | "dichtigkeitspruefung"
  | "verkaufsschild"
  | "finanzierungsangebot"
  | "angebot"
  | "werkstattrechnung"
  | "verkaufsrechnung"
  | "verbindliche_bestellung";

export const BODY_TYPE_LABELS: Record<MotorhomeBodyType, string> = {
  alkoven: "Alkoven",
  teilintegriert: "Teilintegriert",
  vollintegriert: "Vollintegriert",
  kastenwagen: "Kastenwagen",
};

export const MOTORHOME_DOC_LABELS: Record<MotorhomeDocType, string> = {
  dichtigkeitspruefung: "Dichtigkeitsprüfung",
  verkaufsschild: "Verkaufsschild",
  finanzierungsangebot: "Finanzierungsangebot",
  angebot: "Angebot",
  werkstattrechnung: "Werkstattrechnung",
  verkaufsrechnung: "Verkaufsrechnung",
  verbindliche_bestellung: "Verbindliche Bestellung",
};
