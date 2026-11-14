"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import type { PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

export function LocalPdfPreview({ file, page, onPageChange }: {
  file: File;
  page: number;
  onPageChange: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [status, setStatus] = useState("Läser PDF-sidan…");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loading: PDFDocumentLoadingTask | undefined;
    let rendering: RenderTask | undefined;
    async function renderPage() {
      setStatus("Läser PDF-sidan…");
      setError("");
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        loading = pdfjs.getDocument({
          data: bytes,
          isEvalSupported: false,
          useSystemFonts: true,
          maxImageSize: 16_777_216
        });
        const document = await loading.promise;
        if (cancelled) return;
        setPageCount(document.numPages);
        const pdfPage = await document.getPage(Math.min(Math.max(1, page), document.numPages));
        if (cancelled || !canvasRef.current) return;
        const original = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(1.6, Math.sqrt(4_000_000 / (original.width * original.height)));
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        rendering = pdfPage.render({ canvas, viewport });
        await rendering.promise;
        if (!cancelled) setStatus("");
      } catch {
        if (!cancelled) { setError("PDF-sidan kunde inte visas. Kontrollera att filen inte är lösenordsskyddad."); setStatus(""); }
      }
    }
    void renderPage();
    return () => {
      cancelled = true;
      rendering?.cancel();
      if (loading) void loading.destroy().catch(() => undefined);
    };
  }, [file, page]);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-center gap-4 border border-ink-200 bg-white p-3">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Föregående sida</Button>
      <span className="text-sm">Sida {page} av {pageCount || "…"}</span>
      <Button variant="secondary" disabled={!pageCount || page >= pageCount} onClick={() => onPageChange(page + 1)}>Nästa sida</Button>
    </div>
    {status && <p role="status" className="text-sm">{status}</p>}
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    <div className="max-h-[75vh] overflow-auto border border-ink-300 bg-ink-100 p-4">
      <canvas ref={canvasRef} aria-label={`PDF-sida ${page}`} className="mx-auto h-auto max-w-full bg-white shadow-sm" />
    </div>
  </div>;
}
