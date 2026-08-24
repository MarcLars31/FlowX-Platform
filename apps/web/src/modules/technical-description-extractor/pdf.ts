import { readPdfTextDocument } from "@/lib/pdf-text-document";
import { layoutTextFromPdfItems, shouldPreferPdfLayoutText } from "./pdf-layout";
import type { TechnicalDescriptionPage } from "./types";

const MIN_TEXT_PAGE_LENGTH = 80;

export async function extractTechnicalDescriptionPages(
  data: Buffer | Uint8Array
): Promise<TechnicalDescriptionPage[]> {
  const pages = await readPdfTextDocument(data);

  return pages.map((page) => {
    const plainText = page.text.trim();
    const layoutText = layoutTextFromPdfItems(page.items);
    const text = shouldPreferPdfLayoutText(plainText, layoutText)
      ? layoutText
      : plainText;
    const readable = text.length >= MIN_TEXT_PAGE_LENGTH;

    return {
      pageNumber: page.pageNumber,
      text,
      method: "text" as const,
      confidence: readable ? 0.98 : text ? 0.65 : 0,
      status: readable
        ? ("success" as const)
        : text
          ? ("partial" as const)
          : ("failed" as const),
      errorCode: readable ? undefined : "text_extraction_failed",
      errorMessage: readable
        ? undefined
        : text
          ? "PDF page contains only a short text layer."
          : "No text could be extracted from the PDF page."
    };
  });
}

export function pagesRequiringOcr(pages: readonly TechnicalDescriptionPage[]) {
  return pages
    .filter((page) => page.text.length < MIN_TEXT_PAGE_LENGTH)
    .map((page) => page.pageNumber);
}
