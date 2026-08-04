import { ensurePdfCanvasRuntime } from "@/lib/pdf-runtime";
import type { ExtractedPageText } from "./types";

export async function extractPdfTextPages(
  data: Buffer | Uint8Array
): Promise<ExtractedPageText[]> {
  await ensurePdfCanvasRuntime();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });

  try {
    const result = await parser.getText();

    return result.pages.map((page) => ({
      pageNumber: page.num,
      text: page.text
    }));
  } finally {
    await parser.destroy();
  }
}
