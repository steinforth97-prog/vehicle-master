import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { BackgroundEditDialog } from "@/components/BackgroundEditDialog";

export const Route = createFileRoute("/einstellungen")({
  component: () => <AppLayout><SettingsPage /></AppLayout>,
  head: () => ({ meta: [{ title: "Einstellungen — Fleet" }] }),
});

type Kind = "auto" | "wohnmobil";

function SettingsPage() {
  const { isAdmin } = useAuth();
  const [companies, setCompanies] = useState<Record<Kind, any>>({ auto: {}, wohnmobil: {} });
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKind, setSavingKind] = useState<Kind | null>(null);
  const [uploadingKind, setUploadingKind] = useState<Kind | null>(null);
  const [active, setActive] = useState<Kind>("auto");

  useEffect(() => {
    Promise.all([
      supabase.from("company_settings").select("*"),
      supabase.from("profiles").select("id, email, full_name, user_roles(role)"),
    ]).then(([cs, m]) => {
      const map: Record<Kind, any> = { auto: {}, wohnmobil: {} };
      (cs.data ?? []).forEach((row: any) => { map[(row.kind ?? "auto") as Kind] = row; });
      setCompanies(map);
      setMembers(m.data ?? []);
      setLoading(false);
    });
  }, []);

  const updateField = (kind: Kind, key: string, value: any) => {
    setCompanies(prev => ({ ...prev, [kind]: { ...prev[kind], [key]: value } }));
  };

  const save = async (kind: Kind) => {
    setSavingKind(kind);
    try {
      const data = companies[kind];
      if (data.id) {
        const { id, created_at, updated_at, ...rest } = data;
        const { error } = await supabase.from("company_settings").update(rest).eq("id", id);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from("company_settings").insert({ ...data, kind }).select().single();
        if (error) throw error;
        setCompanies(prev => ({ ...prev, [kind]: ins }));
      }
      toast.success("Einstellungen gespeichert");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setSavingKind(null); }
  };

  const uploadLogo = async (kind: Kind, file: File) => {
    setUploadingKind(kind);
    try {
      const ext = file.name.split(".").pop();
      const path = `logo-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("company-assets").getPublicUrl(path);
      updateField(kind, "logo_url", pub.publicUrl);
      toast.success("Logo hochgeladen – nicht vergessen zu speichern");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setUploadingKind(null); }
  };

  const uploadBackground = async (kind: Kind, file: File) => {
    setUploadingKind(kind);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `background-${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("company-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("company-assets").getPublicUrl(path);
      updateField(kind, "background_image_url", pub.publicUrl);
      updateField(kind, "background_storage_path", path);
      toast.success("Hintergrund hochgeladen – nicht vergessen zu speichern");
    } catch (err: any) {
      toast.error(err.message);
    } finally { setUploadingKind(null); }
  };

  if (loading) return <div className="p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1">Firmendaten erscheinen automatisch in den jeweiligen Dokumenten.</p>
      </div>

      <Tabs value={active} onValueChange={v => setActive(v as Kind)}>
        <TabsList>
          <TabsTrigger value="auto">Fahrzeuge (Firma 1)</TabsTrigger>
          <TabsTrigger value="wohnmobil">Wohnmobile (Firma 2)</TabsTrigger>
        </TabsList>

        {(["auto", "wohnmobil"] as Kind[]).map(kind => (
          <TabsContent key={kind} value={kind} className="space-y-6 mt-6">
            <CompanyEditor
              kind={kind}
              data={companies[kind]}
              onChange={(k, v) => updateField(kind, k, v)}
              onUploadLogo={file => uploadLogo(kind, file)}
              onUploadBackground={file => uploadBackground(kind, file)}
              uploading={uploadingKind === kind}
            />
            <div className="flex justify-end">
              <Button onClick={() => save(kind)} disabled={savingKind === kind}>
                {savingKind === kind ? "Speichert…" : "Einstellungen speichern"}
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Mitarbeiter</h2>
        <div className="rounded-md border divide-y">
          {members.map(m => (
            <div key={m.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{m.full_name || m.email}</div>
                <div className="text-xs text-muted-foreground">{m.email}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-muted">
                {m.user_roles?.[0]?.role === "admin" ? "Admin" : "Mitarbeiter"}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Neue Mitarbeiter können sich selbst über die Login-Seite registrieren. {isAdmin && "Du bist Admin."}
        </p>
      </Card>
    </div>
  );
}

function CompanyEditor({
  kind, data, onChange, onUploadLogo, onUploadBackground, uploading,
}: {
  kind: Kind;
  data: any;
  onChange: (key: string, value: any) => void;
  onUploadLogo: (file: File) => void;
  onUploadBackground: (file: File) => void;
  uploading: boolean;
}) {
  return (
    <>
      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Firma</h2>
        <Field label="Firmenname"><Input value={data.company_name ?? ""} onChange={e => onChange("company_name", e.target.value)} /></Field>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2"><Field label="Straße & Nr."><Input value={data.address_street ?? ""} onChange={e => onChange("address_street", e.target.value)} /></Field></div>
          <Field label="PLZ"><Input value={data.address_zip ?? ""} onChange={e => onChange("address_zip", e.target.value)} /></Field>
          <div className="md:col-span-3"><Field label="Ort"><Input value={data.address_city ?? ""} onChange={e => onChange("address_city", e.target.value)} /></Field></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Telefon"><Input value={data.phone ?? ""} onChange={e => onChange("phone", e.target.value)} /></Field>
          <Field label="E-Mail"><Input type="email" value={data.email ?? ""} onChange={e => onChange("email", e.target.value)} /></Field>
          <Field label="Website"><Input value={data.website ?? ""} onChange={e => onChange("website", e.target.value)} /></Field>
          <Field label="USt-IdNr."><Input value={data.vat_id ?? ""} onChange={e => onChange("vat_id", e.target.value)} /></Field>
          <Field label="Steuernummer"><Input value={data.tax_number ?? ""} onChange={e => onChange("tax_number", e.target.value)} /></Field>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Bankverbindung</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Bank"><Input value={data.bank_name ?? ""} onChange={e => onChange("bank_name", e.target.value)} /></Field>
          <div className="md:col-span-2"><Field label="IBAN"><Input value={data.bank_iban ?? ""} onChange={e => onChange("bank_iban", e.target.value)} /></Field></div>
          <Field label="BIC"><Input value={data.bank_bic ?? ""} onChange={e => onChange("bank_bic", e.target.value)} /></Field>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">Logo</h2>
        <div className="flex items-center gap-4">
          {data.logo_url && <img src={data.logo_url} alt="Logo" className="h-16 w-auto object-contain bg-muted rounded p-2" />}
          <label className="inline-flex">
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onUploadLogo(e.target.files[0])} />
            <Button variant="outline" asChild>
              <span><Upload className="h-4 w-4 mr-1" /> {uploading ? "Lädt…" : "Logo hochladen"}</span>
            </Button>
          </label>
        </div>
      </Card>

      {kind === "wohnmobil" && (
        <BackgroundSection
          data={data}
          uploading={uploading}
          onUploadBackground={onUploadBackground}
          onAiSaved={(url, path) => { onChange("background_image_url", url); onChange("background_storage_path", path); }}
        />
      )}
    </>
  );
}

function BackgroundSection({
  data, uploading, onUploadBackground, onAiSaved,
}: {
  data: any;
  uploading: boolean;
  onUploadBackground: (file: File) => void;
  onAiSaved: (url: string, path: string) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <Card className="p-6 space-y-4">
      <h2 className="font-semibold">Firmenhintergrund für Fahrzeug-Fotos</h2>
      <p className="text-xs text-muted-foreground">
        Wird in der Wohnmobil-Galerie verwendet, um Fahrzeuge per KI vor diesen Hintergrund zu setzen.
      </p>
      <div className="flex items-start gap-4 flex-wrap">
        {data.background_image_url && (
          <img
            src={data.background_image_url}
            alt="Hintergrund"
            className="h-28 w-auto object-cover rounded border"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && onUploadBackground(e.target.files[0])}
            />
            <Button variant="outline" asChild>
              <span><Upload className="h-4 w-4 mr-1" /> {uploading ? "Lädt…" : "Hintergrund hochladen"}</span>
            </Button>
          </label>
          {data.background_image_url && (
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              <Sparkles className="h-4 w-4 mr-1" /> Mit KI bearbeiten
            </Button>
          )}
        </div>
      </div>
      {data.background_image_url && (
        <BackgroundEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          currentUrl={data.background_image_url}
          kind="wohnmobil"
          onSaved={onAiSaved}
        />
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}
