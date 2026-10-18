import {
  closePdfTextDocument,
  openPdfTextDocument,
  plainTextFromPdfItems
} from "@/lib/pdf-runtime";
import { buildPdfDocumentStructure } from "./document-structure";
import type { TechnicalDescriptionPage } from "./types";
import { commentsFromPdfAnnotations } from "./pdf-annotations";
import {
  layoutTextFromPdfItems,
  shouldPreferPdfLayoutText
} from "./pdf-layout";

import { pdfPostInventoryFromItems } from "./post-inventory";
import { sitePostTableFromPdfItems } from "./pdf-post-table";

import { nonTextBodyOcrReason, pageRequiresOcr, MIN_TEXT_PAGE_LENGTH } from "./pdf-ocr-detection";

/** Read the document hierarchy independently of product analysis. */
export async function readPdfDocument(data: Buffer | Uint8Array, fileName?: string) {
  return buildPdfDocumentStructure(await extractTechnicalDescriptionPages(data), fileName);
}

export async function extractTechnicalDescriptionPages(
  data: Buffer | Uint8Array,
  options: { cachedPages?: TechnicalDescriptionPage[]; onPage?: (page: TechnicalDescriptionPage) => Promise<void>; beforePage?: () => void } = {}
): Promise<TechnicalDescriptionPage[]> {
  const document = await openPdfTextDocument(data);

  try { return await extractPagesFromDocument(document, options); }
  finally { await closePdfTextDocument(document); }
}

export async function extractPagesFromDocument(
  document: Awaited<ReturnType<typeof openPdfTextDocument>>,
  options: { cachedPages?: TechnicalDescriptionPage[]; onPage?: (page: TechnicalDescriptionPage) => Promise<void>; beforePage?: () => void } = {}
): Promise<TechnicalDescriptionPage[]> {
    const pages: TechnicalDescriptionPage[] = [];
    const cached = new Map(options.cachedPages?.map(page => [page.pageNumber,page]));
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      options.beforePage?.();
      const saved = cached.get(pageNumber);
      if (saved) { pages.push(saved); continue; }
      let page: Awaited<ReturnType<typeof document.getPage>> | undefined;
      try {
        page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        const plainText = plainTextFromPdfItems(content.items);
        const layoutText = layoutTextFromPdfItems(content.items);
        const postTable = sitePostTableFromPdfItems(content.items);
        const text = shouldPreferPdfLayoutText(plainText, layoutText)
          ? layoutText
          : plainText;
        const ocrReason = text.length >= MIN_TEXT_PAGE_LENGTH
          ? await nonTextBodyOcrReason(page, content.items) : undefined;
        const readable = text.length >= MIN_TEXT_PAGE_LENGTH && !ocrReason;
        let annotations: TechnicalDescriptionPage["annotations"];
        let annotationReadFailed = false;
        try {
          annotations = commentsFromPdfAnnotations(await page.getAnnotations({ intent: "display" }), content.items);
        } catch {
          // A broken comment must not discard otherwise readable page text.
          annotationReadFailed = true;
        }
        pages.push({
          pageNumber,
          text,
          ...(postTable && !ocrReason ? { postTable } : {}),
          postInventory: pdfPostInventoryFromItems(content.items),
          ...(ocrReason ? { ocrReason } : {}),
          method: "text",
          confidence: readable ? 0.98 : text ? 0.55 : 0,
          status: readable ? "success" : text ? "partial" : "failed",
          errorCode: readable ? undefined : "ocr_failed",
          errorMessage: readable
            ? undefined
            : ocrReason === "body-check-failed"
              ? "Sidans bildinnehåll kunde inte kontrolleras och behöver OCR-behandlas eller granskas."
              : ocrReason
              ? "Sidans bildinnehåll saknar tillräcklig maskinläsbar text och behöver OCR-behandlas."
              : "Sidan innehåller för lite maskinläsbar text och behöver granskas eller OCR-behandlas.",
          ...(annotations?.length ? { annotations } : {}),
          ...(annotationReadFailed ? { annotationReadFailed } : {})
        });
      } catch {
        pages.push({pageNumber,text:"",method:"text",confidence:0,status:"failed",errorCode:"text_extraction_failed",
          errorMessage:"Sidans text kunde inte läsas. Sidan behöver OCR eller manuell granskning."});
      } finally {
        try { page?.cleanup(); }
        catch { console.warn("pdf_page_cleanup_failed", { pageNumber }); }
      }
      // Persistence/cancellation failures must still abort the worker, not become PDF errors.
      await options.onPage?.(pages[pages.length - 1]);
    }
    return pages;
}

export function pagesRequiringOcr(pages: readonly TechnicalDescriptionPage[]) {
  return pages
    .filter((page) => pageRequiresOcr(page))
    .map((page) => page.pageNumber);
}
