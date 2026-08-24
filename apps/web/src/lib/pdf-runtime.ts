let runtimePromise: Promise<void> | undefined;

/**
 * PDF.js expects browser canvas globals even when it runs in Node. Vercel's
 * server runtime does not provide them, so install the native canvas
 * implementations before importing pdf-parse/pdfjs-dist.
 */
export function ensurePdfCanvasRuntime() {
  runtimePromise ??= import("@napi-rs/canvas").then((canvas) => {
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.DOMMatrix ??= canvas.DOMMatrix;
    globals.ImageData ??= canvas.ImageData;
    globals.Path2D ??= canvas.Path2D;
  });

  return runtimePromise;
}
