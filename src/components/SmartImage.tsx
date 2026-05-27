import { useEffect, useRef, useState } from "react";
import { isHeic } from "@/lib/heic";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Migrate = {
  bucket: string;
  storagePath: string;
  table: "vehicle_images" | "motorhome_images";
  id: string;
};

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  /** If provided, a converted JPEG is persisted to storage and the DB row is updated. */
  migrate?: Migrate;
  /** Called with the new public URL after a successful migration. */
  onMigrated?: (newUrl: string) => void;
};

// Module-level cache so the same HEIC isn't converted twice across the page,
// and so a migration in flight is shared between mounts.
const urlCache = new Map<string, string>(); // src -> resolved (blob: or public:) url
const inflight = new Map<string, Promise<string>>();

async function convertHeicUrl(src: string): Promise<Blob> {
  const res = await fetch(src);
  const blob = await res.blob();
  const mod = await import("heic2any");
  const heic2any = (mod as any).default ?? (mod as any);
  const out = (await heic2any({ blob, toType: "image/jpeg", quality: 0.85 })) as Blob | Blob[];
  return Array.isArray(out) ? out[0] : out;
}

async function resolveOnce(src: string, migrate?: Migrate, onMigrated?: (u: string) => void): Promise<string> {
  const cached = urlCache.get(src);
  if (cached) return cached;
  const running = inflight.get(src);
  if (running) return running;

  const p = (async () => {
    const jpeg = await convertHeicUrl(src);

    if (migrate) {
      try {
        const newPath = migrate.storagePath.replace(/\.(heic|heif)$/i, ".jpg");
        const finalPath = newPath === migrate.storagePath ? `${migrate.storagePath}.jpg` : newPath;
        const { error: upErr } = await supabase.storage
          .from(migrate.bucket)
          .upload(finalPath, jpeg, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(migrate.bucket).getPublicUrl(finalPath);
        const newUrl = pub.publicUrl;
        const { error: updErr } = await supabase
          .from(migrate.table)
          .update({ url: newUrl, storage_path: finalPath })
          .eq("id", migrate.id);
        if (updErr) throw updErr;
        // best-effort cleanup of old HEIC
        supabase.storage.from(migrate.bucket).remove([migrate.storagePath]).catch(() => {});
        urlCache.set(src, newUrl);
        urlCache.set(newUrl, newUrl);
        onMigrated?.(newUrl);
        return newUrl;
      } catch (e) {
        console.warn("[SmartImage] persist JPEG failed, using blob fallback", e);
      }
    }

    const blobUrl = URL.createObjectURL(jpeg);
    urlCache.set(src, blobUrl);
    return blobUrl;
  })();

  inflight.set(src, p);
  try {
    return await p;
  } finally {
    inflight.delete(src);
  }
}

export function SmartImage({ src, className, alt = "", migrate, onMigrated, ...rest }: Props) {
  const initial = !isHeic(src) ? src : urlCache.get(src) ?? null;
  const [resolved, setResolved] = useState<string | null>(initial);
  const [failed, setFailed] = useState(false);
  const migrateRef = useRef(migrate);
  const onMigratedRef = useRef(onMigrated);
  migrateRef.current = migrate;
  onMigratedRef.current = onMigrated;

  useEffect(() => {
    setFailed(false);
    if (!isHeic(src)) {
      setResolved(src);
      return;
    }
    const cached = urlCache.get(src);
    if (cached) {
      setResolved(cached);
      return;
    }
    setResolved(null);
    let cancelled = false;
    resolveOnce(src, migrateRef.current, onMigratedRef.current)
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch((e) => {
        console.warn("[SmartImage] HEIC convert failed", e);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <div className={"flex items-center justify-center text-xs text-muted-foreground " + (className ?? "")}>
        HEIC nicht darstellbar
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className={"flex items-center justify-center " + (className ?? "")}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <img src={resolved} alt={alt} className={className} {...rest} />;
}
