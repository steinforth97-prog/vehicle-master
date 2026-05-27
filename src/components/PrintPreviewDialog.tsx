import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PdfCanvasViewer } from "@/components/PdfCanvasViewer";
import { Printer, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Either a Blob, a function returning a Blob (lazy), or an external URL */
  source: Blob | (() => Promise<Blob>) | { url: string };
  title?: string;
  filename?: string;
}

export function PrintPreviewDialog({ open, onClose, source, title = "Druckvorschau", filename = "dokument.pdf" }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    (async () => {
      try {
        let url: string;
        if (source instanceof Blob) {
          url = URL.createObjectURL(source);
          createdUrl = url;
        } else if (typeof source === "function") {
          const b = await source();
          url = URL.createObjectURL(b);
          createdUrl = url;
        } else {
          // External URL — fetch as blob to allow same-origin iframe printing
          const res = await fetch(source.url);
          const b = await res.blob();
          url = URL.createObjectURL(b);
          createdUrl = url;
        }
        if (cancelled) {
          if (createdUrl) URL.revokeObjectURL(createdUrl);
          return;
        }
        setBlobUrl(url);
      } catch (e: any) {
        toast.error(e.message ?? "Vorschau konnte nicht geladen werden");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setBlobUrl(null);
    };
  }, [open, source]);

  const handlePrint = () => {
    if (!blobUrl) return;
    // Remove previous hidden iframe if any
    if (printIframeRef.current) {
      printIframeRef.current.remove();
      printIframeRef.current = null;
    }
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = blobUrl;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e: any) {
        toast.error("Druckdialog konnte nicht geöffnet werden");
      }
    };
    document.body.appendChild(iframe);
    printIframeRef.current = iframe;
  };

  useEffect(() => {
    return () => {
      if (printIframeRef.current) {
        printIframeRef.current.remove();
        printIframeRef.current = null;
      }
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="truncate">{title}</DialogTitle>
        </DialogHeader>
        {loading || !blobUrl ? (
          <div className="flex-1 flex items-center justify-center bg-muted">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <PdfCanvasViewer blobUrl={blobUrl} />
        )}
        <DialogFooter className="px-4 py-3 border-t gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>Schließen</Button>
          {blobUrl && (
            <Button variant="outline" asChild>
              <a href={blobUrl} download={filename}>
                <Download className="h-4 w-4 mr-1" /> Download
              </a>
            </Button>
          )}
          <Button onClick={handlePrint} disabled={!blobUrl}>
            <Printer className="h-4 w-4 mr-1" /> Drucken
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
