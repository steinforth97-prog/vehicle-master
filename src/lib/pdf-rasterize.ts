// Rasterize a PDF file into compressed JPEG data URLs (one per page).
// Used to keep payloads small enough for AI providers (≤ ~30MB total).
export async function rasterizePdfToJpegs(
  file: File,
  opts: { maxPages?: number; scale?: number; quality?: number } = {}
): Promise<string[]> {
  const { maxPages = 4, scale = 1.5, quality = 0.7 } = opts;
  const pdfjs: any = await import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl: string = (await import(/* @vite-ignore */ "pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const out: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    out.push(canvas.toDataURL("image/jpeg", quality));
  }
  return out;
}
