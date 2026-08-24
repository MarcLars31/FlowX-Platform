import { createWorker } from "tesseract.js";
import { ensurePdfCanvasRuntime } from "@/lib/pdf-runtime";
import type { TechnicalDescriptionPage } from "./types";
import {
  isBetterOcrText,
  layoutTextFromOcrBlocks,
  layoutTextFromPdfItems,
  shouldPreferOcrLayoutText,
  shouldPreferPdfLayoutText
} from "./pdf-layout";

const OCR_SCALE = 2;
const OCR_RETRY_SCALE = 2.5;
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
      const internalDocument = (parser as unknown as {
        doc?: { getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> };
      }).doc;
      textPages = await Promise.all(textResult.pages.map(async (page) => {
        const plainText = page.text.trim();
        let text = plainText;
        if (internalDocument && /postnr\.?|mengde|enhetspris/i.test(plainText)) {
          try {
            const pdfPage = await internalDocument.getPage(page.num);
            const content = await pdfPage.getTextContent();
            const layoutText = layoutTextFromPdfItems(content.items);
            if (shouldPreferPdfLayoutText(plainText, layoutText)) text = layoutText;
          } catch {
            // A page-level layout failure must not discard otherwise readable text.
          }
        }
        return {
          pageNumber: page.num,
          text,
          method: "text" as const,
          confidence: 0.98,
          status: "success" as const
        };
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

    const ocrPageNumbers = pagesRequiringOcr(textPages);
    let screenshots: Awaited<ReturnType<typeof parser.getScreenshot>>;
    try {
      screenshots = await parser.getScreenshot({
        scale: OCR_SCALE,
        imageBuffer: true,
        imageDataUrl: false,
        // When text extraction succeeded, render only the pages that actually
        // need OCR. Rendering every page makes mixed PDFs with large drawings
        // needlessly expensive and can exhaust a serverless request.
        ...(textPages.length > 0 ? { partial: ocrPageNumbers } : {})
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
      await worker.setParameters({ preserve_interword_spaces: "1" });
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
          if (extractedPages.length > 0) {
            // Reset Tesseract's adaptive classifier between unrelated pages.
            // Dense table pages otherwise influence later pages and can make
            // post numbers or isolated quantity cells disappear.
            await worker.reinitialize("nor+eng", 1);
            await worker.setParameters({ preserve_interword_spaces: "1" });
          }
          let result = await worker.recognize(
            Buffer.from(screenshot.data),
            {},
            { text: true, blocks: true }
          );
          let text = preferredOcrText(result.data.text, result.data.blocks);
          if (needsHigherResolutionOcr(text)) {
            const retryScreenshots = await parser.getScreenshot({
              scale: OCR_RETRY_SCALE,
              imageBuffer: true,
              imageDataUrl: false,
              partial: [pageNumber]
            });
            const retryScreenshot = retryScreenshots.pages.find(
              (candidate) => candidate.pageNumber === pageNumber
            );
            if (retryScreenshot) {
              await worker.reinitialize("nor+eng", 1);
              await worker.setParameters({ preserve_interword_spaces: "1" });
              const retryResult = await worker.recognize(
                Buffer.from(retryScreenshot.data),
                {},
                { text: true, blocks: true }
              );
              const retryText = preferredOcrText(
                retryResult.data.text,
                retryResult.data.blocks
              );
              if (isBetterOcrText(retryText, text)) {
                result = retryResult;
                text = retryText;
              }
            }
          }
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

export function pagesRequiringOcr(pages: readonly TechnicalDescriptionPage[]) {
  return pages
    .filter((page) => page.text.length < MIN_TEXT_PAGE_LENGTH)
    .map((page) => page.pageNumber);
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

function preferredOcrText(plainValue: string, blocks: readonly unknown[] | null) {
  const plainText = plainValue.trim();
  const layoutText = layoutTextFromOcrBlocks(blocks).trim();
  return shouldPreferOcrLayoutText(plainText, layoutText)
    ? layoutText
    : plainText;
}

function needsHigherResolutionOcr(text: string) {
  const unit = String.raw`(?:stk|st|pcs?|m|lm|[i1]m|meter|løpemeter|m2|m²|m3|m³|kg|l)`;
  return new RegExp(
    String.raw`^(?:Antall|Lengde)(?:\s+${unit}\.?)?\s*$`,
    "im"
  ).test(text);
}
