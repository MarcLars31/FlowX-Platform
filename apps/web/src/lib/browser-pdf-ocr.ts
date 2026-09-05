"use client";

import {
  isBetterOcrText,
  layoutTextFromOcrBlocks,
  shouldPreferOcrLayoutText
} from "@/modules/technical-description-extractor/pdf-layout";
import type { ClientOcrPage } from "./technical-description-ocr-payload";
import type { PDFPageProxy } from "pdfjs-dist";

const OCR_SCALE = 2;
const OCR_RETRY_SCALE = 2.5;
const MAX_CANVAS_PIXELS = 5_000_000;

export type BrowserOcrProgress = {
  label: string;
  pageNumber?: number;
  totalPages?: number;
};

export async function extractPdfPagesWithBrowserOcr(
  file: File,
  requestedPageNumbers: readonly number[],
  onProgress?: (progress: BrowserOcrProgress) => void
): Promise<ClientOcrPage[]> {
  onProgress?.({ label: "Förbereder OCR…" });
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "/ocr/pdf.worker.min.mjs",
    window.location.origin
  ).toString();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    disableFontFace: true,
    isEvalSupported: false,
    maxImageSize: 16_777_216,
    stopAtErrors: false,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  const pageNumbers = [...new Set(requestedPageNumbers)]
    .filter(
      (pageNumber) =>
        Number.isInteger(pageNumber) &&
        pageNumber >= 1 &&
        pageNumber <= document.numPages
    )
    .sort((left, right) => left - right);

  if (pageNumbers.length === 0) {
    await loadingTask.destroy();
    return [];
  }

  let activePageNumber = pageNumbers[0];
  let activePageIndex = 0;
  const { createWorker, OEM } = await import("tesseract.js");
  const worker = await createWorker("nor+eng", OEM.LSTM_ONLY, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/tesseract-core-lstm.wasm.js",
    langPath: "/ocr",
    gzip: true,
    logger(message) {
      if (message.status !== "recognizing text") return;
      const percentage = Math.round(Math.min(Math.max(message.progress, 0), 1) * 100);
      onProgress?.({
        label: `OCR sida ${activePageNumber} av ${document.numPages} · ${percentage}%`,
        pageNumber: activePageNumber,
        totalPages: document.numPages
      });
    }
  });

  try {
    await worker.setParameters({ preserve_interword_spaces: "1" });
    const extractedPages: ClientOcrPage[] = [];
    for (const pageNumber of pageNumbers) {
      activePageNumber = pageNumber;
      onProgress?.({
        label: `OCR sida ${pageNumber} av ${document.numPages}…`,
        pageNumber,
        totalPages: document.numPages
      });
      if (activePageIndex > 0) {
        await worker.reinitialize("nor+eng", OEM.LSTM_ONLY);
        await worker.setParameters({ preserve_interword_spaces: "1" });
      }

      const page = await document.getPage(pageNumber);
      let canvas = await renderPdfPage(page, OCR_SCALE);
      let result = await worker.recognize(
        canvas,
        {},
        { text: true, blocks: true }
      );
      let text = preferredOcrText(result.data.text, result.data.blocks);

      if (needsHigherResolutionOcr(text)) {
        canvas.width = 0;
        canvas.height = 0;
        canvas = await renderPdfPage(page, OCR_RETRY_SCALE);
        await worker.reinitialize("nor+eng", OEM.LSTM_ONLY);
        await worker.setParameters({ preserve_interword_spaces: "1" });
        const retryResult = await worker.recognize(
          canvas,
          {},
          { text: true, blocks: true }
        );
        const retryText = preferredOcrText(
          retryResult.data.text,
          retryResult.data.blocks
        );
        if (isBetterOcrText(retryText, text)) {
          result = retryResult;
          text = retryText;
        }
      }

      extractedPages.push({
        pageNumber,
        text,
        confidence: normalizeOcrConfidence(result.data.confidence)
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      activePageIndex += 1;
    }
    return extractedPages;
  } finally {
    await worker.terminate();
    await loadingTask.destroy();
  }
}

async function renderPdfPage(
  page: PDFPageProxy,
  requestedScale: number
) {
  const baseViewport = page.getViewport({ scale: 1 });
  const safeScale = Math.min(
    requestedScale,
    Math.sqrt(MAX_CANVAS_PIXELS / (baseViewport.width * baseViewport.height))
  );
  const viewport = page.getViewport({ scale: safeScale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas;
}

function preferredOcrText(plainValue: string, blocks: readonly unknown[] | null) {
  const plainText = plainValue.trim();
  const layoutText = layoutTextFromOcrBlocks(blocks).trim();
  return shouldPreferOcrLayoutText(plainText, layoutText)
    ? layoutText
    : plainText;
}

function needsHigherResolutionOcr(text: string) {
  const unit = String.raw`(?:stk|st|pcs?|m|lm|[i1]m|meter|løpemeter|m2|m²|m3|m³|kg|l)`;
  return new RegExp(
    String.raw`^(?:Antall|Lengde)(?:\s+${unit}\.?)?\s*$`,
    "im"
  ).test(text);
}

function normalizeOcrConfidence(confidence: number | undefined) {
  const safeConfidence = typeof confidence === "number" ? confidence : 72;
  return Math.min(Math.max(safeConfidence / 100, 0.45), 0.96);
}
