import "server-only";
import {
  detectProductDocumentLanguage,
  prepareProductDocumentPages,
  type StagedProductDocumentPage
} from "@/lib/product-document-page-mapping";
import { extractTechnicalDescriptionPages } from "@/modules/technical-description-extractor/pdf";

export type ProductDocumentPageInspection = {
  pages: StagedProductDocumentPage[];
  pageCount: number | null;
  failedPageNumbers: number[];
  extractionMethods: string[];
  errorCode:
    | "ocr_failed"
    | "text_extraction_failed"
    | "table_extraction_failed"
    | null;
  adminErrorMessage: string | null;
  technicalErrorDetail: string | null;
};

export async function inspectProductDocumentPages(
  data: Buffer | Uint8Array,
  options: { fallbackPageCount?: number | null; languageCode?: string | null } = {}
): Promise<ProductDocumentPageInspection> {
  try {
    const extractedPages = await extractTechnicalDescriptionPages(data);
    return summarizeProductDocumentPages(
      prepareProductDocumentPages(
        extractedPages,
        options.languageCode ?? detectProductDocumentLanguage(extractedPages)
      )
    );
  } catch (error) {
    const technicalErrorDetail = safeErrorMessage(error);
    const fallbackPageCount = positiveInteger(options.fallbackPageCount);
    const pages = fallbackPageCount
      ? Array.from({ length: fallbackPageCount }, (_, index) => ({
          page_number: index + 1,
          status: "failed" as const,
          extraction_method: "text" as const,
          ...(options.languageCode ? { language_code: options.languageCode } : {}),
          extracted_text: "",
          extracted_tables: [],
          source_coordinates: [],
          error_code: "text_extraction_failed" as const,
          error_message: "Sidtexten kunde inte extraheras."
        }))
      : [];

    return {
      pages,
      pageCount: fallbackPageCount,
      failedPageNumbers: pages.map((page) => page.page_number),
      extractionMethods: ["text"],
      errorCode: "text_extraction_failed",
      adminErrorMessage: "PDF-sidornas text kunde inte extraheras.",
      technicalErrorDetail
    };
  }
}

export function summarizeProductDocumentPages(
  pages: StagedProductDocumentPage[]
): ProductDocumentPageInspection {
  const failedPages = pages.filter((page) => page.status !== "success");
  const firstFailure = failedPages[0];
  return {
    pages,
    pageCount:
      pages.length > 0 ? Math.max(...pages.map((page) => page.page_number)) : null,
    failedPageNumbers: failedPages.map((page) => page.page_number),
    extractionMethods: [...new Set(pages.map((page) => page.extraction_method))],
    errorCode: firstFailure?.error_code ?? null,
    adminErrorMessage: firstFailure
      ? "En eller flera PDF-sidor kunde inte lÃ¤sas fullstÃ¤ndigt."
      : null,
    technicalErrorDetail: firstFailure?.error_message ?? null
  };
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 8_000);
}
