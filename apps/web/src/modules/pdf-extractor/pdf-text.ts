import {
  closePdfTextDocument,
  openPdfTextDocument,
  plainTextFromPdfItems
} from "@/lib/pdf-runtime";
import type { ExtractedPageText } from "./types";

export async function extractPdfTextPages(
  data: Buffer | Uint8Array
): Promise<ExtractedPageText[]> {
  const document = await openPdfTextDocument(data);

  try {
    const pages: ExtractedPageText[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({
        pageNumber,
        text: plainTextFromPdfItems(content.items)
      });
    }
    return pages;
  } finally {
    await closePdfTextDocument(document);
  }
}
