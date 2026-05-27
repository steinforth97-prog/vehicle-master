import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";

export type MaskHandle = {
  /** Returns a binary mask (white=edit, black=keep) sized to the source image. */
  exportMask: (width: number, height: number) => string | null;
  clear: () => void;
  hasStrokes: () => boolean;
};

type Props = {
  /** Background image URL (for visual ref) */
  imageUrl: string;
  brushSize: number;
  mode: "paint" | "erase";
  /** Max internal canvas resolution (does not constrain CSS display size) */
  maxWidth?: number;
};

export const MaskCanvas = forwardRef<MaskHandle, Props>(function MaskCanvas(
  { imageUrl, brushSize, mode, maxWidth = 1400 },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const hasStrokesRef = useRef(false);

  useImperativeHandle(ref, () => ({
    exportMask: (width: number, height: number) => {
      if (!hasStrokesRef.current) return null;
      const overlay = overlayRef.current;
      if (!overlay) return null;
      const out = document.createElement("canvas");
      out.width = width; out.height = height;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, width, height);
      // Use the alpha channel of the overlay to draw white pixels
      const off = document.createElement("canvas");
      off.width = overlay.width; off.height = overlay.height;
      const offCtx = off.getContext("2d")!;
      offCtx.drawImage(overlay, 0, 0);
      const idata = offCtx.getImageData(0, 0, off.width, off.height);
      const d = idata.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (a > 0) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255; }
        else { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255; }
      }
      offCtx.putImageData(idata, 0, 0);
      ctx.drawImage(off, 0, 0, width, height);
      return out.toDataURL("image/png");
    },
    clear: () => {
      const c = overlayRef.current;
      if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
      hasStrokesRef.current = false;
    },
    hasStrokes: () => hasStrokesRef.current,
  }));

  const onLoad = () => {
    const img = imgRef.current!;
    const w = Math.min(maxWidth, img.naturalWidth);
    const h = Math.round((img.naturalHeight / img.naturalWidth) * w);
    setSize({ w, h });
    const c = overlayRef.current!;
    c.width = w; c.height = h;
    c.getContext("2d")!.clearRect(0, 0, w, h);
    hasStrokesRef.current = false;
  };

  const pos = (e: React.PointerEvent) => {
    const c = overlayRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = overlayRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    if (mode === "paint") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(220, 60, 60, 0.55)";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    hasStrokesRef.current = true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = pos(e);
    lastRef.current = p;
    stroke(p, p);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = pos(e);
    if (lastRef.current) stroke(lastRef.current, p);
    lastRef.current = p;
  };
  const onPointerUp = () => { drawingRef.current = false; lastRef.current = null; };

  useEffect(() => {
    const c = overlayRef.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasStrokesRef.current = false;
  }, [imageUrl]);

  return (
    <div ref={wrapRef} className="relative inline-block max-w-full max-h-full leading-none">
      <img
        ref={imgRef}
        src={imageUrl}
        crossOrigin="anonymous"
        onLoad={onLoad}
        className="block select-none max-w-full max-h-[calc(90vh-180px)] w-auto h-auto object-contain"
        draggable={false}
        alt=""
      />
      <canvas
        ref={overlayRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 cursor-crosshair touch-none w-full h-full"
      />
    </div>
  );
});
