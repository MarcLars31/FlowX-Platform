import {
  closePdfTextDocument,
  openPdfTextDocument,
  plainTextFromPdfItems
} from "@/lib/pdf-runtime";
import type { TechnicalDescriptionPage } from "./types";
import {
  layoutTextFromPdfItems,
  shouldPreferPdfLayoutText
} from "./pdf-layout";

const MIN_TEXT_PAGE_LENGTH = 80;

export async function extractTechnicalDescriptionPages(
  data: Buffer | Uint8Array
): Promise<TechnicalDescriptionPage[]> {
  const document = await openPdfTextDocument(data);

  try {
    const pages: TechnicalDescriptionPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const plainText = plainTextFromPdfItems(content.items);
      const layoutText = layoutTextFromPdfItems(content.items);
      const text = shouldPreferPdfLayoutText(plainText, layoutText)
        ? layoutText
        : plainText;
      const readable = text.length >= MIN_TEXT_PAGE_LENGTH;
      pages.push({
        pageNumber,
        text,
        method: "text",
        confidence: readable ? 0.98 : text ? 0.55 : 0,
        status: readable ? "success" : text ? "partial" : "failed",
        errorCode: readable ? undefined : "ocr_failed",
        errorMessage: readable
          ? undefined
          : "Sidan innehåller för lite maskinläsbar text och behöver granskas eller OCR-behandlas."
      });
    }
    return pages;
  } finally {
    await closePdfTextDocument(document);
  }
}

export function pagesRequiringOcr(pages: readonly TechnicalDescriptionPage[]) {
  return pages
    .filter((page) => page.text.length < MIN_TEXT_PAGE_LENGTH)
    .map((page) => page.pageNumber);
}
