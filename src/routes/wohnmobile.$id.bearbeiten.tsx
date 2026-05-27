import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { MotorhomeForm } from "@/components/MotorhomeForm";

export const Route = createFileRoute("/wohnmobile/$id/bearbeiten")({
  component: () => {
    const { id } = Route.useParams();
    return <AppLayout><MotorhomeForm motorhomeId={id} /></AppLayout>;
  },
  head: () => ({ meta: [{ title: "Wohnmobil bearbeiten — Fleet" }] }),
});
