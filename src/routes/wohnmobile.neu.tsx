import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { MotorhomeForm } from "@/components/MotorhomeForm";

export const Route = createFileRoute("/wohnmobile/neu")({
  component: () => <AppLayout><MotorhomeForm /></AppLayout>,
  head: () => ({ meta: [{ title: "Neues Wohnmobil — Fleet" }] }),
});
