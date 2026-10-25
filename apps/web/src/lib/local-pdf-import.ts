import { extractTechnicalDescriptionFromPages } from "@/modules/technical-description-extractor/extractor";
import { pageRequiresOcr } from "@/modules/technical-description-extractor/pdf-ocr-detection";
import type { TechnicalDescriptionExtractionResult } from "@/modules/technical-description-extractor/types";
import { mergeClientOcrPages } from "./technical-description-ocr-payload";
import type { BrowserOcrProgress, extractPdfPagesWithBrowserOcr } from "./browser-pdf-ocr";

export type LocalPdfImportResult = { result: TechnicalDescriptionExtractionResult; ocrPageNumbers: number[] };
type Dependencies = { fetch: typeof fetch; extractOcr: typeof extractPdfPagesWithBrowserOcr };

/** Read digital text locally, then recover unreadable pages in the browser.
 * Emit each completed page so a later OCR failure cannot hide recovered posts. */
export async function readLocalPdf(
  file: File,
  onProgress: (progress: BrowserOcrProgress) => void,
  onResult: (result: LocalPdfImportResult) => void,
  dependencies?: Dependencies
): Promise<LocalPdfImportResult> {
  onProgress({ label: "Läser PDF-text…", progress: 0 });
  const form = new FormData();
  form.set("file", file);
  const response = await (dependencies?.fetch ?? fetch)("/api/local/pdf", {
    method: "POST", headers: { "x-scipx-local-design": "1" }, body: form
  });
  const payload = await response.json() as Partial<LocalPdfImportResult> & { error?: string };
  if (!response.ok || !payload.result) throw new Error(payload.error ?? "PDF-filen kunde inte läsas.");
  let pages = payload.result.pages;
  const requestedPages = payload.ocrPageNumbers ?? pages.filter(page => pageRequiresOcr(page)).map(page => page.pageNumber);
  let current: LocalPdfImportResult = { result: payload.result, ocrPageNumbers: requestedPages };
  onResult(current);
  if (!requestedPages.length) return current;

  const recognize = dependencies?.extractOcr ?? (await import("./browser-pdf-ocr")).extractPdfPagesWithBrowserOcr;
  await recognize(file, requestedPages, onProgress, async page => {
    pages = mergeClientOcrPages(pages, [page]);
    current = {
      result: extractTechnicalDescriptionFromPages(pages, { fileName: file.name }),
      ocrPageNumbers: pages.filter(page => pageRequiresOcr(page) || page.method === "ocr" && page.status !== "success").map(page => page.pageNumber)
    };
    onResult(current);
  });
  onProgress({ label: "PDF-läsningen är klar", progress: 1 });
  return current;
}
