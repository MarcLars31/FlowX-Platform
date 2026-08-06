import { createWorker } from "tesseract.js";
import { ensurePdfCanvasRuntime } from "@/lib/pdf-runtime";
import type { TechnicalDescriptionPage } from "./types";

const OCR_SCALE = 2;
const MIN_TEXT_PAGE_LENGTH = 80;

export async function extractTechnicalDescriptionPages(
  data: Buffer | Uint8Array
): Promise<TechnicalDescriptionPage[]> {
  await ensurePdfCanvasRuntime();
  const { PDFParse } = await import("pdf-parse");
  // pdfjs-dist's default Node worker path is not included by Vercel's
  // serverless tracing when the package is externalized. pdf-parse ships a
  // self-contained data URL for the worker specifically for this case.
  const { getData: getPdfWorkerData } = await import("pdf-parse/worker");
  PDFParse.setWorker(getPdfWorkerData());
  const parser = new PDFParse({ data });

  try {
    let textPages: TechnicalDescriptionPage[] = [];
    let textExtractionError: unknown;
    try {
      const textResult = await parser.getText();
      textPages = textResult.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text.trim(),
        method: "text" as const,
        confidence: 0.98,
        status: "success" as const
      }));
    } catch (error) {
      textExtractionError = error;
    }

    if (
      textPages.length > 0 &&
      textPages.every((page) => page.text.length >= MIN_TEXT_PAGE_LENGTH)
    ) {
      return textPages;
    }

    let screenshots: Awaited<ReturnType<typeof parser.getScreenshot>>;
    try {
      screenshots = await parser.getScreenshot({
        scale: OCR_SCALE,
        imageBuffer: true,
        imageDataUrl: false
      });
    } catch (screenshotError) {
      if (textPages.length > 0) {
        return textPages.map((page) =>
          page.text.length >= MIN_TEXT_PAGE_LENGTH
            ? page
            : failedOcrPage(page, screenshotError)
        );
      }
      throw combinedExtractionError(textExtractionError, screenshotError);
    }

    const screenshotsByPage = new Map(
      screenshots.pages.map((page) => [page.pageNumber, page] as const)
    );
    const pageNumbers = [
      ...new Set([
        ...textPages.map((page) => page.pageNumber),
        ...screenshots.pages.map((page) => page.pageNumber)
      ])
    ].sort((left, right) => left - right);
    const textByPage = new Map(textPages.map((page) => [page.pageNumber, page]));

    let worker: Awaited<ReturnType<typeof createWorker>>;
    try {
      worker = await createWorker("nor+eng", 1);
    } catch (error) {
      return pageNumbers.map((pageNumber) => {
        const textPage = textByPage.get(pageNumber) ?? emptyTextPage(pageNumber);
        return textPage.text.length >= MIN_TEXT_PAGE_LENGTH
          ? textPage
          : failedOcrPage(textPage, error);
      });
    }

    try {
      const extractedPages: TechnicalDescriptionPage[] = [];
      for (const pageNumber of pageNumbers) {
        const textPage = textByPage.get(pageNumber) ?? emptyTextPage(pageNumber);
        if (textPage.text.length >= MIN_TEXT_PAGE_LENGTH) {
          extractedPages.push(textPage);
          continue;
        }

        const screenshot = screenshotsByPage.get(pageNumber);
        if (!screenshot) {
          extractedPages.push(
            failedOcrPage(textPage, new Error("PDF page image was unavailable."))
          );
          continue;
        }

        try {
          const result = await worker.recognize(Buffer.from(screenshot.data));
          const text = result.data.text.trim();
          extractedPages.push({
            pageNumber,
            text: text || textPage.text,
            method: "ocr",
            confidence: normalizeOcrConfidence(result.data.confidence),
            status: text ? "success" : textPage.text ? "partial" : "failed",
            errorCode: text ? undefined : "ocr_failed",
            errorMessage: text ? undefined : "OCR returned no readable text."
          });
        } catch (error) {
          extractedPages.push(failedOcrPage(textPage, error));
        }
      }

      return extractedPages;
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
}

function emptyTextPage(pageNumber: number): TechnicalDescriptionPage {
  return {
    pageNumber,
    text: "",
    method: "text",
    confidence: 0,
    status: "failed",
    errorCode: "text_extraction_failed",
    errorMessage: "No text could be extracted from the PDF page."
  };
}

function failedOcrPage(
  textPage: TechnicalDescriptionPage,
  error: unknown
): TechnicalDescriptionPage {
  return {
    ...textPage,
    method: "ocr",
    confidence: Math.min(textPage.confidence, 0.35),
    status: textPage.text ? "partial" : "failed",
    errorCode: "ocr_failed",
    errorMessage: safeErrorMessage(error)
  };
}

function combinedExtractionError(textError: unknown, imageError: unknown) {
  return new Error(
    `PDF text and image extraction failed: ${safeErrorMessage(textError)}; ${safeErrorMessage(imageError)}`
  );
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}

function normalizeOcrConfidence(confidence: number | undefined) {
  const safeConfidence = typeof confidence === "number" ? confidence : 72;
  return Math.min(Math.max(safeConfidence / 100, 0.45), 0.96);
}
