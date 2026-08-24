import { readPdfTextDocument } from "@/lib/pdf-text-document";
import type { ExtractedPageText } from "./types";

export async function extractPdfTextPages(
  data: Buffer | Uint8Array
): Promise<ExtractedPageText[]> {
  const pages = await readPdfTextDocument(data);
  return pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text
  }));
}
