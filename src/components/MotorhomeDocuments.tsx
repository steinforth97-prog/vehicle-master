import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Loader2, FileText, Trash2, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { MOTORHOME_DOC_LABELS, type MotorhomeDocType } from "@/lib/motorhomes";
import { MotorhomeDocDialog } from "@/components/MotorhomeDocDialog";
import type { MotorhomeForPdf, CompanyData } from "@/lib/motorhome-docs";

type DocRow = { id: string; name: string; url: string; storage_path: string; created_at: string };
type RecordRow = { id: string; type: MotorhomeDocType; document_number: string | null; created_at: string; data: any; buyer_name: string | null; buyer_address: string | null };

export function MotorhomeDocuments({ motorhomeId }: { motorhomeId: string }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [motorhome, setMotorhome] = useState<MotorhomeForPdf | null>(null);
  const [company, setCompany] = useState<CompanyData>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeType, setActiveType] = useState<MotorhomeDocType | null>(null);
  const [editRecord, setEditRecord] = useState<RecordRow | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const [d, r, m, c] = await Promise.all([
      supabase.from("motorhome_documents").select("*").eq("motorhome_id", motorhomeId).order("created_at", { ascending: false }),
      supabase.from("motorhome_doc_records").select("*").eq("motorhome_id", motorhomeId).order("created_at", { ascending: false }),
      supabase.from("motorhomes").select("*").eq("id", motorhomeId).single(),
      supabase.from("company_settings").select("*").eq("kind", "wohnmobil").maybeSingle(),
    ]);
    setDocs((d.data ?? []) as DocRow[]);
    setRecords((r.data ?? []) as RecordRow[]);
    if (m.data) setMotorhome(m.data as unknown as MotorhomeForPdf);
    setCompany((c.data as CompanyData) ?? {});
    setLoading(false);
  };

  useEffect(() => { reload(); }, [motorhomeId]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const path = `motorhomes/${motorhomeId}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from("vehicle-documents").upload(path, file);
        if (error) throw error;
        const { data: pub } = supabase.storage.from("vehicle-documents").getPublicUrl(path);
        await supabase.from("motorhome_documents").insert({
          motorhome_id: motorhomeId, name: file.name, url: pub.publicUrl, storage_path: path,
        });
      }
      await reload();
      toast.success("Hochgeladen");
    } catch (e: any) {
      toast.error(e.message ?? "Upload fehlgeschlagen");
    } finally { setUploading(false); }
  };

  const removeDoc = async (doc: DocRow) => {
    if (!confirm("Dokument löschen?")) return;
    await supabase.storage.from("vehicle-documents").remove([doc.storage_path]);
    await supabase.from("motorhome_documents").delete().eq("id", doc.id);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
  };

  const removeRecord = async (id: string) => {
    if (!confirm("Eintrag löschen?")) return;
    await supabase.from("motorhome_doc_records").delete().eq("id", id);
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Dokumente generieren</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {(Object.keys(MOTORHOME_DOC_LABELS) as MotorhomeDocType[]).map(type => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              onClick={() => setActiveType(type)}
              disabled={!motorhome}
              className="justify-start"
            >
              <FileText className="h-4 w-4 mr-1" /> {MOTORHOME_DOC_LABELS[type]}
            </Button>
          ))}
        </div>

        {records.length > 0 && (
          <div className="mt-4 rounded-md border divide-y">
            {records.map(r => (
              <div key={r.id} className="p-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{MOTORHOME_DOC_LABELS[r.type]}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("de-DE")}
                    {r.document_number && ` · ${r.document_number}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditRecord(r)} title="Bearbeiten">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeRecord(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Hochgeladene Dateien</h2>
          <input ref={fileInput} type="file" multiple className="hidden"
            onChange={e => { upload(e.target.files); e.target.value = ""; }} />
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Hochladen
          </Button>
        </div>

        {loading ? (
          <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : docs.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground border-2 border-dashed rounded-md">
            Noch keine Dateien hochgeladen.
          </div>
        ) : (
          <div className="rounded-md border divide-y">
            {docs.map(d => (
              <div key={d.id} className="p-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{d.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" asChild>
                    <a href={d.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeDoc(d)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {activeType && motorhome && (
        <MotorhomeDocDialog
          type={activeType}
          motorhome={motorhome}
          company={company}
          onClose={() => setActiveType(null)}
          onSaved={reload}
        />
      )}

      {editRecord && motorhome && (
        <MotorhomeDocDialog
          type={editRecord.type}
          motorhome={motorhome}
          company={company}
          existingRecord={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
