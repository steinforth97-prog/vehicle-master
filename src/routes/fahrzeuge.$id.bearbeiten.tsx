import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { VehicleForm } from "@/components/VehicleForm";

export const Route = createFileRoute("/fahrzeuge/$id/bearbeiten")({
  component: () => {
    const { id } = Route.useParams();
    return <AppLayout><VehicleForm vehicleId={id} /></AppLayout>;
  },
  head: () => ({ meta: [{ title: "Fahrzeug bearbeiten — Fleet" }] }),
});
