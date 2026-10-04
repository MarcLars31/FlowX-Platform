"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { findPdfPostAnchor } from "@/lib/project-source-pdf";

type PdfState = { url: string; document?: PDFDocumentProxy; error?: string };
const PdfContext = createContext<PdfState | null>(null);

/** Keep the current document in this workspace while moving between its posts. */
export function ProjectSourcePdfProvider({ sourcePdfHref, children }: { sourcePdfHref: string | null; children: ReactNode }) {
  const url = sourcePdfHref?.split("#")[0] ?? "";
  const [result, setResult] = useState<PdfState | null>(null);
  useEffect(() => {
    if (!url) return;
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.min.mjs");
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("/ocr/pdf.worker.min.mjs", window.location.origin).toString();
        loadingTask = pdfjs.getDocument({ url, isEvalSupported: false, maxImageSize: 16_777_216, useSystemFonts: true });
        const document = await loadingTask.promise;
        if (active) setResult({ url, document });
      } catch {
        if (active) setResult({ url, error: "Original-PDF-en kunne ikke vises. Kravteksten er tilgjengelig nedenfor." });
      }
    })();
    return () => { active = false; void loadingTask?.destroy().catch(() => {}); };
  }, [url]);
  return <PdfContext.Provider value={result?.url === url ? result : { url }}>{children}</PdfContext.Provider>;
}

export function ProjectSourcePdf({ sourcePdfHref, sourcePage, postNumber, sourceText, children }: {
  sourcePdfHref: string | null;
  sourcePage: number | null;
  postNumber: string | null;
  sourceText: string | null;
  children: ReactNode;
}) {
  const pdf = useContext(PdfContext);
  const [pageNumber, setPageNumber] = useState(sourcePage ?? 1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState<{ key: string; error?: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const document = pdf?.document;
  const renderKey = `${pdf?.url}:${pageNumber}:${width}:${zoom}`;
  const error = pdf?.error ?? (rendered?.key === renderKey ? rendered.error : undefined);
  const loading = !error && (!document || rendered?.key !== renderKey);
  const text = sourceText ? <><div className="source-pdf-text">{sourceText}</div><details className="source-pdf-transcript"><summary>Postopplysninger</summary>{children}</details></> : children;

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0) setWidth(Math.floor(container.clientWidth));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [sourcePdfHref]);

  useEffect(() => {
    if (!document || !width) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    void (async () => {
      try {
        if (pageNumber < 1 || pageNumber > document.numPages) throw new Error("Den angitte PDF-siden finnes ikke i originalfilen.");
        const page = await document.getPage(pageNumber);
        if (!active) return;
        const original = page.getViewport({ scale: 1 });
        const scale = Math.max(0.1, (width - 16) / original.width) * zoom;
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(5_000_000 / (viewport.width * viewport.height)));
        const buffer = window.document.createElement("canvas");
        buffer.width = Math.max(1, Math.ceil(viewport.width * pixelRatio));
        buffer.height = Math.max(1, Math.ceil(viewport.height * pixelRatio));
        const context = buffer.getContext("2d");
        if (!context) throw new Error("PDF-visningen kunne ikke startes.");
        renderTask = page.render({ canvas: buffer, canvasContext: context, viewport,
          transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] });
        const [content] = await Promise.all([
          page.getTextContent().catch(() => null), renderTask.promise
        ]);
        if (!active || !canvasRef.current || !scrollRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = buffer.width;
        canvas.height = buffer.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        canvas.getContext("2d")?.drawImage(buffer, 0, 0);
        const anchor = pageNumber === sourcePage && postNumber && content ? findPdfPostAnchor(content.items, postNumber) : null;
        scrollRef.current.scrollTop = anchor ? Math.max(0, viewport.convertToViewportPoint(anchor.x, anchor.y)[1] - 24) : 0;
        scrollRef.current.scrollLeft = 0;
        setRendered({ key: renderKey });
      } catch (failure) {
        if (active) setRendered({ key: renderKey, error: failure instanceof Error ? failure.message : "PDF-siden kunne ikke vises." });
      }
    })();
    return () => { active = false; renderTask?.cancel(); };
  }, [document, width, zoom, pageNumber, postNumber, sourcePage, renderKey]);

  if (!sourcePdfHref) return <div className="source-pdf-fallback">{text}</div>;
  return <div className="source-pdf-viewer">
    <div className="source-pdf-toolbar" role="group" aria-label="PDF-visning">
      <strong>Original PDF</strong>
      <button type="button" disabled={!document || pageNumber <= 1} onClick={() => setPageNumber(page => page - 1)} aria-label="Forrige PDF-side">‹</button>
      <span aria-live="polite">Side {pageNumber}{document ? ` av ${document.numPages}` : ""}</span>
      <button type="button" disabled={!document || pageNumber >= document.numPages} onClick={() => setPageNumber(page => page + 1)} aria-label="Neste PDF-side">›</button>
      <button type="button" disabled={zoom <= 0.75} onClick={() => setZoom(value => Math.max(0.75, value - 0.25))} aria-label="Zoom ut">−</button>
      <button type="button" onClick={() => setZoom(1)}>Tilpass bredde</button>
      <button type="button" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.25))} aria-label="Zoom inn">+</button>
      <a href={`${sourcePdfHref.split("#")[0]}#page=${pageNumber}`} target="_blank" rel="noopener noreferrer">Åpne PDF</a>
    </div>
    {loading && <p role="status" className="source-pdf-message">Laster original PDF…</p>}
    {error && <p role="status" className="source-pdf-message">{error}</p>}
    <div ref={scrollRef} className="source-pdf-canvas-scroll" tabIndex={0} role="region" aria-label={`Original PDF, side ${pageNumber}`} aria-busy={loading} hidden={Boolean(error)}>
      <canvas ref={canvasRef} role="img" aria-label={`PDF-side ${pageNumber}${postNumber ? `, post ${postNumber}` : ""}. Kravteksten finnes under Krav som tekst.`} style={{ visibility: loading || error ? "hidden" : "visible" }} />
    </div>
    {error ? text : <details className="source-pdf-transcript"><summary>Krav som tekst</summary>{text}</details>}
  </div>;
}
