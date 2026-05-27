import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { VehicleForm } from "@/components/VehicleForm";

export const Route = createFileRoute("/fahrzeuge/neu")({
  component: () => <AppLayout><VehicleForm /></AppLayout>,
  head: () => ({ meta: [{ title: "Neues Fahrzeug — Fleet" }] }),
});
