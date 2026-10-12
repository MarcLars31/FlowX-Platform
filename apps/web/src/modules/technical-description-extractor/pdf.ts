import {
  closePdfTextDocument,
  openPdfTextDocument,
  plainTextFromPdfItems
} from "@/lib/pdf-runtime";
import type { TechnicalDescriptionPage } from "./types";
import { commentsFromPdfAnnotations } from "./pdf-annotations";
import {
  layoutTextFromPdfItems,
  shouldPreferPdfLayoutText
} from "./pdf-layout";

import { sitePostTableFromPdfItems } from "./pdf-post-table";

import { nonTextBodyOcrReason, pageRequiresOcr, MIN_TEXT_PAGE_LENGTH } from "./pdf-ocr-detection";

export async function extractTechnicalDescriptionPages(
  data: Buffer | Uint8Array,
  options: { cachedPages?: TechnicalDescriptionPage[]; onPage?: (page: TechnicalDescriptionPage) => Promise<void>; beforePage?: () => void } = {}
): Promise<TechnicalDescriptionPage[]> {
  const document = await openPdfTextDocument(data);

  try {
    const pages: TechnicalDescriptionPage[] = [];
    const cached = new Map(options.cachedPages?.map(page => [page.pageNumber,page]));
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      options.beforePage?.();
      const saved = cached.get(pageNumber);
      if (saved) { pages.push(saved); continue; }
      const page = await document.getPage(pageNumber);
      try {
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
        await options.onPage?.(pages[pages.length - 1]);
      } finally { page.cleanup(); }
    }
    return pages;
  } finally {
    await closePdfTextDocument(document);
  }
}

export function pagesRequiringOcr(pages: readonly TechnicalDescriptionPage[]) {
  return pages
    .filter((page) => pageRequiresOcr(page))
    .map((page) => page.pageNumber);
}
