import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { Camera, Loader2, Trash2, Download, FileText, Plus, ExternalLink, Eye, Printer } from "lucide-react";
import { PdfCanvasViewer } from "@/components/PdfCanvasViewer";
import { PrintPreviewDialog } from "@/components/PrintPreviewDialog";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface VehicleDoc {
  id: string;
  name: string;
  storage_path: string;
  url: string;
  page_count: number;
  created_at: string;
}

const BUCKET = "vehicle-documents";

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function imageFileToJpegBytes(file: File): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const img = await fileToImage(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(2000 / img.naturalWidth, 1);
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), "image/jpeg", 0.85)!);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, w: canvas.width, h: canvas.height };
}

async function buildPdfBlob(items: File[]): Promise<{ blob: Blob; pageCount: number }> {
  const out = await PDFDocument.create();
  // A4 in points
  const A4_W = 595.28;
  const A4_H = 841.89;
  const margin = 24;

  for (const file of items) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (isPdf) {
      const src = await PDFDocument.load(await file.arrayBuffer());
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
    } else {
      const { bytes, w, h } = await imageFileToJpegBytes(file);
      const jpg = await out.embedJpg(bytes);
      const page = out.addPage([A4_W, A4_H]);
      const maxW = A4_W - margin * 2;
      const maxH = A4_H - margin * 2;
      const ratio = Math.min(maxW / w, maxH / h);
      const dw = w * ratio;
      const dh = h * ratio;
      page.drawImage(jpg, {
        x: (A4_W - dw) / 2,
        y: (A4_H - dh) / 2,
        width: dw,
        height: dh,
      });
    }
  }
  const bytes = await out.save();
  return { blob: new Blob([bytes as BlobPart], { type: "application/pdf" }), pageCount: out.getPageCount() };
}

export function VehicleDocuments({ vehicleId }: { vehicleId: string }) {
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<VehicleDoc | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState<VehicleDoc | null>(null);
  const [viewerBlobUrl, setViewerBlobUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);

  useEffect(() => {
    if (!viewer) {
      if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
      setViewerBlobUrl(null);
      return;
    }
    let cancelled = false;
    setViewerLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.storage.from(BUCKET).download(viewer.storage_path);
        if (error) throw error;
        const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setViewerBlobUrl(url);
      } catch {
        if (!cancelled) setViewerBlobUrl(null);
      } finally {
        if (!cancelled) setViewerLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewer]);

  const reload = async () => {
    const { data } = await supabase
      .from("vehicle_documents")
      .select("*")
      .eq("vehicle_id", vehicleId)
      .order("created_at", { ascending: false });
    setDocs((data ?? []) as VehicleDoc[]);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [vehicleId]);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    const out: File[] = [];
    let converted = 0;
    for (const f of arr) {
      const isHeic = /\.(heic|heif)$/i.test(f.name) || f.type === "image/heic" || f.type === "image/heif";
      if (isHeic) {
        try {
          const heic2any = (await import("heic2any")).default;
          const blob = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.9 });
          const b = Array.isArray(blob) ? blob[0] : blob;
          out.push(new File([b], f.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: "image/jpeg" }));
          converted++;
        } catch (e: any) {
          toast.error(`HEIC konnte nicht konvertiert werden: ${f.name}`);
        }
      } else if (f.type.startsWith("image/")) {
        out.push(f);
      } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        out.push(f);
      }
    }
    if (out.length === 0) { toast.error("Bitte nur Bilder oder PDFs"); return; }
    if (converted > 0) toast.success(`${converted} HEIC-Datei(en) konvertiert`);
    setFiles(prev => [...prev, ...out]);
    if (!dialogOpen) setDialogOpen(true);
  };

  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const create = async () => {
    if (files.length === 0) { toast.error("Mindestens ein Foto auswählen"); return; }
    setCreating(true);
    try {
      const { blob, pageCount } = await buildPdfBlob(files);
      const finalName = (name.trim() || `Fahrzeugdokument-${new Date().toISOString().slice(0, 10)}`).replace(/[^\w\-. ]+/g, "_");
      const path = `${vehicleId}/${Date.now()}-${finalName}.pdf`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { data: u } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("vehicle_documents").insert({
        vehicle_id: vehicleId,
        name: finalName,
        storage_path: path,
        url: pub.publicUrl,
        page_count: pageCount,
        created_by: u.user?.id,
      });
      if (insErr) throw insErr;
      toast.success("Dokument erstellt");
      setFiles([]);
      setName("");
      setDialogOpen(false);
      reload();
    } catch (e: any) {
      toast.error(e.message ?? "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (d: VehicleDoc) => {
    if (!confirm(`„${d.name}" wirklich löschen?`)) return;
    await supabase.storage.from(BUCKET).remove([d.storage_path]);
    await supabase.from("vehicle_documents").delete().eq("id", d.id);
    toast.success("Gelöscht");
    reload();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Fahrzeugdokumente</h2>
        <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Neu
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-3">Fotos aufnehmen oder hochladen — werden zu einer PDF zusammengefasst.</p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Button variant="outline" size="sm" onClick={() => cameraInput.current?.click()}>
          <Camera className="h-4 w-4 mr-1" /> Foto aufnehmen
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
          <Plus className="h-4 w-4 mr-1" /> Bilder/PDFs wählen
        </Button>
        <input ref={cameraInput} type="file" accept="image/*,.heic,.heif" capture="environment" className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={fileInput} type="file" accept="image/*,.heic,.heif,application/pdf,.pdf" multiple className="hidden"
          onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : docs.length === 0 ? (
        <div className="text-xs text-muted-foreground">Noch keine Dokumente.</div>
      ) : (
        <ul className="space-y-2">
          {docs.map(d => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{d.name}</div>
                <div className="text-xs text-muted-foreground">{d.page_count} Seite(n) · {new Date(d.created_at).toLocaleDateString("de-DE")}</div>
              </div>
              <button onClick={() => setViewer(d)} className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted" title="Ansehen">
                <Eye className="h-4 w-4" />
              </button>
              <button onClick={() => setPrintDoc(d)} className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted" title="Drucken">
                <Printer className="h-4 w-4" />
              </button>
              <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted" title="In neuem Tab öffnen">
                <ExternalLink className="h-4 w-4" />
              </a>
              <a href={d.url} download={`${d.name}.pdf`} className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted" title="Download">
                <Download className="h-4 w-4" />
              </a>
              <button onClick={() => remove(d)} className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-destructive/10 text-destructive" title="Löschen">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!creating) { setDialogOpen(o); if (!o) setFiles([]); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neues Fahrzeugdokument</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name (optional)</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Fahrzeugschein, Serviceheft" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => cameraInput.current?.click()}>
                <Camera className="h-4 w-4 mr-1" /> Foto
              </Button>
              <Button variant="outline" onClick={() => fileInput.current?.click()}>
                <Plus className="h-4 w-4 mr-1" /> Bilder/PDFs
              </Button>
            </div>
            {files.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">{files.length} Seite(n)</div>
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-auto">
                  {files.map((f, i) => {
                    const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
                    return (
                      <div key={i} className="relative group">
                        {isPdf ? (
                          <div className="w-full h-24 rounded border flex flex-col items-center justify-center bg-muted text-muted-foreground gap-1 p-1">
                            <FileText className="h-6 w-6" />
                            <span className="text-[10px] truncate w-full text-center px-1">{f.name}</span>
                          </div>
                        ) : (
                          <img src={URL.createObjectURL(f)} alt="" className="w-full h-24 object-cover rounded border" />
                        )}
                        <button onClick={() => removeFile(i)} className="absolute top-1 right-1 bg-background/90 border rounded p-0.5 opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <div className="absolute bottom-1 left-1 text-[10px] bg-background/90 px-1 rounded border">{i + 1}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setFiles([]); }} disabled={creating}>Abbrechen</Button>
            <Button onClick={create} disabled={creating || files.length === 0}>
              {creating ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Erstellt…</> : "PDF erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewer} onOpenChange={(o) => !o && setViewer(null)}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
          <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
            <DialogTitle className="truncate">{viewer?.name}</DialogTitle>
            <div className="flex items-center gap-1 mr-6">
              {viewer && (
                <>
                  <button onClick={() => setPrintDoc(viewer)} className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted" title="Drucken">
                    <Printer className="h-4 w-4" />
                  </button>
                  <a href={viewer.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted" title="In neuem Tab">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <a href={viewer.url} download={`${viewer.name}.pdf`} className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted" title="Download">
                    <Download className="h-4 w-4" />
                  </a>
                </>
              )}
            </div>
          </DialogHeader>
          {viewer && (
            viewerLoading || !viewerBlobUrl ? (
              <div className="flex-1 flex items-center justify-center bg-muted">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <PdfCanvasViewer blobUrl={viewerBlobUrl} />
            )
          )}
        </DialogContent>
      </Dialog>

      {printDoc && (
        <PrintPreviewDialog
          open
          onClose={() => setPrintDoc(null)}
          source={async () => {
            const { data, error } = await supabase.storage.from(BUCKET).download(printDoc.storage_path);
            if (error) throw error;
            return new Blob([data], { type: "application/pdf" });
          }}
          title={printDoc.name}
          filename={`${printDoc.name}.pdf`}
        />
      )}
    </>
  );
}
