import { extractTechnicalDescriptionPages } from "../technical-description-extractor/pdf";
import type { ExtractedPageText } from "./types";

/** Use the same cell separation before either API builds requirements. */
export async function extractPdfTextPages(data: Buffer | Uint8Array): Promise<ExtractedPageText[]> {
  return (await extractTechnicalDescriptionPages(data)).map(page => ({
    pageNumber: page.pageNumber, text: page.text, priceColumns: page.priceColumns
  }));
}
