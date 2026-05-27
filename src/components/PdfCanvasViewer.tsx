import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export function PdfCanvasViewer({ blobUrl }: { blobUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    setError(null);

    (async () => {
      try {
        const pdfjs: any = await import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.mjs");
        const workerUrl: string = (await import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const pdf = await pdfjs.getDocument({ url: blobUrl }).promise;
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";

        const containerWidth = containerRef.current.clientWidth - 16;
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const viewport1 = page.getViewport({ scale: 1 });
          const scale = Math.min(2, Math.max(0.5, containerWidth / viewport1.width));
          const viewport = page.getViewport({ scale });
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = "mx-auto my-2 shadow border bg-white";
          const ctx = canvas.getContext("2d")!;
          ctx.scale(dpr, dpr);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (cancelled) return;
          containerRef.current.appendChild(canvas);
        }
        if (!cancelled) setRendering(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "PDF konnte nicht angezeigt werden");
          setRendering(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [blobUrl]);

  return (
    <div className="flex-1 overflow-auto bg-muted relative">
      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="p-6 text-sm text-center text-destructive">{error}</div>
      )}
      <div ref={containerRef} className="p-2" />
    </div>
  );
}
