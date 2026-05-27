import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Edit, Download, Trash2, Upload, Loader2, Star, Check, X } from "lucide-react";
import { toast } from "sonner";
import { PhotoEditor } from "./PhotoEditor";
import { downloadBlob } from "@/lib/image-filters";
import { cn } from "@/lib/utils";
import { heicFileToJpeg, isHeicFile } from "@/lib/heic";
import { SmartImage } from "./SmartImage";
import type { Adjustments } from "@/lib/image-filters";
import { applyAdjustmentsToStorage } from "@/lib/apply-adjustments";

type ImgRow = {
  id: string;
  url: string;
  storage_path: string;
  position: number;
};

export function VehicleGallery({ vehicleId, mainImageUrl }: { vehicleId: string; mainImageUrl: string | null }) {
  const [images, setImages] = useState<ImgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<ImgRow | null>(null);
  const [bust, setBust] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // Transfer-adjustments flow
  const [transfer, setTransfer] = useState<{ sourceId: string; adj: Adjustments } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const reload = async () => {
    const { data } = await supabase
      .from("vehicle_images")
      .select("id, url, storage_path, position")
      .eq("vehicle_id", vehicleId)
      .order("position");
    setImages((data ?? []) as ImgRow[]);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [vehicleId]);

  const onPick = () => fileInput.current?.click();

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const original of Array.from(files)) {
        const file = isHeicFile(original) ? await heicFileToJpeg(original) : original;
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${vehicleId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("vehicle-images").upload(path, file, { contentType: file.type || undefined });
        if (error) throw error;
        const { data: pub } = supabase.storage.from("vehicle-images").getPublicUrl(path);
        await supabase.from("vehicle_images").insert({
          vehicle_id: vehicleId,
          url: pub.publicUrl,
          storage_path: path,
          position: images.length,
        });
      }
      await reload();
      toast.success("Bild(er) hochgeladen");
    } catch (e: any) {
      toast.error(e.message ?? "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (img: ImgRow) => {
    try {
      const res = await fetch(`${img.url}?cb=${Date.now()}`);
      const blob = await res.blob();
      const ext = img.storage_path.split(".").pop() || "jpg";
      downloadBlob(blob, `bild-${img.id.slice(0, 8)}.${ext}`);
    } catch (e: any) {
      toast.error("Download fehlgeschlagen");
    }
  };

  const handleDelete = async (img: ImgRow) => {
    if (!confirm("Bild wirklich löschen?")) return;
    try {
      await supabase.storage.from("vehicle-images").remove([img.storage_path]);
      await supabase.from("vehicle_images").delete().eq("id", img.id);
      if (mainImageUrl === img.url) {
        await supabase.from("vehicles").update({ main_image_url: null }).eq("id", vehicleId);
      }
      setImages((prev) => prev.filter((i) => i.id !== img.id));
      toast.success("Bild gelöscht");
    } catch (e: any) {
      toast.error(e.message ?? "Löschen fehlgeschlagen");
    }
  };

  const handleSetMain = async (img: ImgRow) => {
    await supabase.from("vehicles").update({ main_image_url: img.url }).eq("id", vehicleId);
    toast.success("Als Hauptbild gesetzt");
  };

  const toggleSelected = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const cancelTransfer = () => { setTransfer(null); setSelected(new Set()); };

  const applyTransfer = async () => {
    if (!transfer || selected.size === 0) return;
    setApplying(true);
    const targets = images.filter((i) => selected.has(i.id) && i.id !== transfer.sourceId);
    let ok = 0;
    for (const img of targets) {
      try {
        await applyAdjustmentsToStorage({
          bucket: "vehicle-images",
          url: img.url,
          storagePath: img.storage_path,
          adjustments: transfer.adj,
        });
        ok++;
      } catch (e: any) {
        console.warn("transfer failed", img.id, e);
      }
    }
    setApplying(false);
    cancelTransfer();
    setBust((b) => b + 1);
    toast.success(`Auf ${ok} Foto${ok === 1 ? "" : "s"} übertragen`);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Fotos</h2>
        <div className="flex items-center gap-2">
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          <Button size="sm" variant="outline" onClick={onPick} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Hochladen
          </Button>
        </div>
      </div>

      {transfer && (
        <div className="mb-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className="font-medium">Anpassungen übertragen:</span>{" "}
            <span className="text-muted-foreground">
              Wähle die Zielbilder aus und klicke „Übertragen". {selected.size} ausgewählt.
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={cancelTransfer} disabled={applying}>
              <X className="h-4 w-4" /> Abbrechen
            </Button>
            <Button size="sm" onClick={applyTransfer} disabled={applying || selected.size === 0}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Übertragen ({selected.size})
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : images.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground border-2 border-dashed rounded-md">
          Noch keine Fotos. Lade Bilder hoch oder ziehe sie ins Fenster.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img) => {
            const isMain = mainImageUrl === img.url;
            const isSource = transfer?.sourceId === img.id;
            const isSelected = selected.has(img.id);
            const inTransfer = !!transfer;
            return (
              <div
                key={img.id}
                className={cn(
                  "group relative aspect-[4/3] rounded-md overflow-hidden border bg-muted",
                  inTransfer && !isSource && "cursor-pointer",
                  inTransfer && isSelected && "ring-2 ring-primary",
                  inTransfer && isSource && "opacity-60",
                )}
                onClick={inTransfer && !isSource ? () => toggleSelected(img.id) : undefined}
              >
                <SmartImage
                  src={`${img.url}?v=${bust}`}
                  alt=""
                  className="w-full h-full object-contain pointer-events-none"
                  loading="lazy"
                  migrate={{ bucket: "vehicle-images", storagePath: img.storage_path, table: "vehicle_images", id: img.id }}
                  onMigrated={async (newUrl) => {
                    if (mainImageUrl === img.url) {
                      await supabase.from("vehicles").update({ main_image_url: newUrl }).eq("id", vehicleId);
                    }
                    reload();
                  }}
                />

                {isMain && (
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium flex items-center gap-1">
                    <Star className="h-3 w-3" /> Hauptbild
                  </div>
                )}

                {inTransfer && isSource && (
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-background/90 text-[10px] font-medium">
                    Quelle
                  </div>
                )}
                {inTransfer && !isSource && (
                  <div className={cn(
                    "absolute top-1.5 right-1.5 h-5 w-5 rounded-md border-2 grid place-items-center bg-background/90",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"
                  )}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                )}

                {!inTransfer && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                    <ActionBtn title="Bearbeiten" onClick={() => setEditing(img)}><Edit className="h-4 w-4" /></ActionBtn>
                    <ActionBtn title="Download" onClick={() => handleDownload(img)}><Download className="h-4 w-4" /></ActionBtn>
                    {!isMain && (
                      <ActionBtn title="Als Hauptbild" onClick={() => handleSetMain(img)}><Star className="h-4 w-4" /></ActionBtn>
                    )}
                    <ActionBtn title="Löschen" danger onClick={() => handleDelete(img)}><Trash2 className="h-4 w-4" /></ActionBtn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <PhotoEditor
          imageUrl={editing.url}
          storagePath={editing.storage_path}
          filename={`fahrzeug-${editing.id.slice(0, 8)}.jpg`}
          total={images.length}
          index={images.findIndex((i) => i.id === editing.id)}
          onNavigate={(newIdx) => {
            const next = images[newIdx];
            if (next) setEditing(next);
          }}
          onClose={() => setEditing(null)}
          onSaved={(info) => {
            setBust((b) => b + 1);
            const src = editing;
            reload();
            if (info?.adjustments && src) {
              // Offer to transfer the just-applied adjustments to other photos
              setTransfer({ sourceId: src.id, adj: info.adjustments });
              setSelected(new Set());
            }
          }}
        />
      )}
    </div>
  );
}

function ActionBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "h-8 w-8 grid place-items-center rounded-md backdrop-blur bg-background/90 hover:bg-background transition",
        danger && "hover:bg-destructive hover:text-destructive-foreground",
      )}
    >
      {children}
    </button>
  );
}
