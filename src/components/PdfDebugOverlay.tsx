import { useEffect, useRef, useState } from "react";

export type RegionBox = { page?: number; x: number; y: number; w: number; h: number };
export type RegionMap = Record<string, RegionBox | undefined>;

const FIELD_COLORS: Record<string, string> = {
  price: "#ef4444",
  hu_au: "#3b82f6",
  emission_class: "#10b981",
  tag_number: "#f59e0b",
  short_features: "#a855f7",
};

const FIELD_LABELS: Record<string, string> = {
  price: "Preis",
  hu_au: "HU/AU",
  emission_class: "Schadstoffklasse",
  tag_number: "Nr.",
  short_features: "Kurzausstattung",
};

export function PdfDebugOverlay({ file, regions }: { file: File; regions: RegionMap }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const page = 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs: any = await import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.mjs");
        try {
          const workerMod: any = await import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.worker.mjs?url");
          pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
        } catch {
          pdfjs.GlobalWorkerOptions.workerSrc = "";
        }
        const buf = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: buf }).promise;
        const p = await pdf.getPage(page + 1);
        const targetW = Math.max(320, wrapRef.current?.clientWidth ?? 480);
        const viewport0 = p.getViewport({ scale: 1 });
        const scale = targetW / viewport0.width;
        const viewport = p.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await p.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setSize({ w: viewport.width, h: viewport.height });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [file]);

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded border bg-muted/30">
      <canvas ref={canvasRef} className="block w-full h-auto" />
      {size && Object.entries(regions).map(([key, box]) => {
        if (!box || (box.page ?? 0) !== page) return null;
        const color = FIELD_COLORS[key] ?? "#ef4444";
        return (
          <div
            key={key}
            className="absolute pointer-events-none"
            style={{
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.w * 100}%`,
              height: `${box.h * 100}%`,
              border: `2px solid ${color}`,
              background: `${color}22`,
              boxShadow: `0 0 0 1px ${color}55`,
            }}
          >
            <span
              className="absolute -top-4 left-0 text-[10px] font-semibold px-1 rounded-sm text-white whitespace-nowrap"
              style={{ background: color }}
            >
              {FIELD_LABELS[key] ?? key}
            </span>
          </div>
        );
      })}
      {error && <div className="p-2 text-xs text-destructive">PDF-Vorschau fehlgeschlagen: {error}</div>}
      {!size && !error && <div className="p-4 text-xs text-muted-foreground">PDF wird gerendert…</div>}
    </div>
  );
}
