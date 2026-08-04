import { createWorker } from "tesseract.js";
import { ensurePdfCanvasRuntime } from "@/lib/pdf-runtime";
import type { TechnicalDescriptionPage } from "./types";

const OCR_SCALE = 2;

export async function extractTechnicalDescriptionPages(
  data: Buffer | Uint8Array
): Promise<TechnicalDescriptionPage[]> {
  await ensurePdfCanvasRuntime();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });

  try {
    const textResult = await parser.getText();
    const textPages = textResult.pages.map((page) => ({
      pageNumber: page.num,
      text: page.text.trim(),
      method: "text" as const,
      confidence: 0.98
    }));

    if (textPages.some((page) => page.text.length >= 80)) {
      return textPages;
    }

    const screenshots = await parser.getScreenshot({
      scale: OCR_SCALE,
      imageBuffer: true,
      imageDataUrl: false
    });
    const worker = await createWorker("nor+eng", 1);

    try {
      const ocrPages: TechnicalDescriptionPage[] = [];
      for (const screenshot of screenshots.pages) {
        const result = await worker.recognize(Buffer.from(screenshot.data));
        ocrPages.push({
          pageNumber: screenshot.pageNumber,
          text: result.data.text.trim(),
          method: "ocr",
          confidence: normalizeOcrConfidence(result.data.confidence)
        });
      }

      return ocrPages;
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
}

function normalizeOcrConfidence(confidence: number | undefined) {
  const safeConfidence = typeof confidence === "number" ? confidence : 72;
  return Math.min(Math.max(safeConfidence / 100, 0.45), 0.96);
}
