import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  inspectProductDocumentPages,
  summarizeProductDocumentPages,
  type ProductDocumentPageInspection
} from "@/lib/product-document-pages";
import { mergeExtractorPageDetails } from "@/lib/product-document-page-mapping";
import { extractProductPdf, ProductPdfServiceError } from "@/lib/product-pdf-extractor-client";
import type {
  ProductDocumentStatus,
  ProductPdfExtractionPayload
} from "@/lib/product-pdf-processing";
import { prepareProductPdfForStaging } from "@/lib/product-pdf-staging";
import { callSupabaseRpc, selectSupabaseRows } from "@/lib/supabase-rest";
import { downloadAdminStorageObject } from "@/lib/supabase-admin-storage";

export const PRODUCT_PDF_READER_VERSION =
  process.env.PRODUCT_PDF_READER_VERSION?.trim() || "product-pdf-extractor/1.0.0";

type ProcessingTrigger =
  | "initial"
  | "automatic_retry"
  | "manual_retry"
  | "reader_upgrade";

type DocumentRow = {
  id: string;
  file_name: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  pdf_sha256: string | null;
  deleted_at: string | null;
};

type ProcessingAttempt = {
  id: string;
  document_id: string;
  attempt_number: number;
  status: ProductDocumentStatus;
};

type StagingResult = {
  identified_product_count?: number;
  processed_product_count?: number;
  staged_product_count?: number;
  updated_product_count?: number;
  failed_product_count?: number;
  failed_row_count?: number;
};

type PageStagingFailure = {
  code:
    | "ocr_failed"
    | "text_extraction_failed"
    | "table_extraction_failed"
    | "unknown_error";
  publicMessage: string;
  technicalMessage: string;
};

export type ProductDocumentProcessingResult = {
  documentId: string;
  attemptId: string;
  attemptNumber: number;
  status: ProductDocumentStatus;
  identifiedProductCount: number;
  updatedProductCount: number;
  failedProductCount: number;
  errorCode: string | null;
  message: string;
};

export class ProductDocumentNotFoundError extends Error {}
export class ProductDocumentAlreadyProcessingError extends Error {}

const AUTOMATICALLY_RETRYABLE_CODES = new Set([
  "ocr_failed",
  "text_extraction_failed",
  "table_extraction_failed",
  "timeout",
  "out_of_memory",
  "extractor_unavailable",
  "unknown_error"
]);

export async function processProductDocumentWithAutomaticRetries(
  documentId: string,
  requestedBy: string | null,
  maxAttempts = 3
) {
  const attempts = Math.min(Math.max(Math.floor(maxAttempts), 1), 3);
  let result = await processProductDocument(documentId, "initial", requestedBy);

  for (let index = 1; index < attempts; index += 1) {
    if (!result.errorCode || !AUTOMATICALLY_RETRYABLE_CODES.has(result.errorCode)) break;
    await delay(Math.min(500 * 2 ** (index - 1), 2_000));
    result = await processProductDocument(documentId, "automatic_retry", requestedBy);
  }

  return result;
}

export async function processProductDocument(
  documentId: string,
  trigger: ProcessingTrigger,
  requestedBy: string | null
): Promise<ProductDocumentProcessingResult> {
  const document = await loadDocument(documentId);
  const idempotencyKey = processingIdempotencyKey(document, trigger);

  let attempt: ProcessingAttempt;
  try {
    attempt = await callSupabaseRpc<ProcessingAttempt>(
      "begin_product_document_processing",
      {
        p_document_id: document.id,
        p_trigger_type: trigger,
        p_idempotency_key: idempotencyKey,
        p_reader_version: PRODUCT_PDF_READER_VERSION,
        p_requested_by: requestedBy
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("already") || message.toLowerCase().includes("processing")) {
      throw new ProductDocumentAlreadyProcessingError(message);
    }
    throw error;
  }

  let pageInspection: ProductDocumentPageInspection | null = null;
  let pageStagingFailure: PageStagingFailure | null = null;

  try {
    const file = await downloadStoredPdf(document);
    // Reuse the existing text/OCR preprocessor before the product parser so a
    // scanned or partly broken page is still stored and reviewable even when
    // the product-layout parser rejects the document.
    pageInspection = await inspectProductDocumentPages(file);
    pageStagingFailure = await stageInspectedPages(
      document.id,
      attempt.id,
      pageInspection
    );
    const extraction = await extractProductPdf(file, document.file_name ?? "datasheet.pdf");
    const staging = await stageExtraction(document.id, attempt.id, extraction);
    const metadata = extractionMetadata(extraction);
    const extractorLanguage = extractionLanguageCode(extraction);
    pageInspection = summarizeProductDocumentPages(
      mergeExtractorPageDetails(
        pageInspection.pages,
        extraction.pages ?? [],
        extractorLanguage
      )
    );
    pageStagingFailure =
      (await stageInspectedPages(document.id, attempt.id, pageInspection)) ??
      pageStagingFailure;
    const identified = nonNegativeInteger(
      staging.identified_product_count,
      extraction.products.length
    );
    const updated = nonNegativeInteger(
      staging.updated_product_count,
      0
    );
    const failedProducts = nonNegativeInteger(
      staging.failed_product_count,
      Math.max(0, identified - updated)
    );
    const failedRows =
      nonNegativeInteger(staging.failed_row_count, 0) + (pageStagingFailure ? 1 : 0);
    const failedPageNumbers = uniqueIntegers([
      ...metadata.failedPageNumbers,
      ...pageInspection.failedPageNumbers
    ]);
    const extractionMethods = uniqueStrings([
      ...metadata.extractionMethods,
      ...pageInspection.extractionMethods
    ]);
    const pagePipelineError = pageStagingFailure ?? pageInspectionFailure(pageInspection);
    const status: ProductDocumentStatus =
      failedProducts > 0 || failedRows > 0 || failedPageNumbers.length > 0
        ? "partial"
        : "success";

    await completeAttempt(attempt.id, {
      status,
      errorCode: pagePipelineError?.code,
      adminErrorMessage: pagePipelineError?.publicMessage,
      technicalErrorDetail: pagePipelineError?.technicalMessage,
      identifiedProductCount: identified,
      updatedProductCount: updated,
      failedProductCount: failedProducts,
      failedRowCount: failedRows,
      pageCount: maximumInteger(metadata.pageCount, pageInspection.pageCount),
      failedPageNumbers,
      extractionMethods,
      rawResult: extraction
    });

    return {
      documentId,
      attemptId: attempt.id,
      attemptNumber: attempt.attempt_number,
      status,
      identifiedProductCount: identified,
      updatedProductCount: updated,
      failedProductCount: failedProducts + failedRows,
      errorCode: pagePipelineError?.code ?? null,
      message:
        status === "success"
          ? `${identified} produkt${identified === 1 ? "" : "er"} behandlades.`
          : `${updated} av ${identified} produkter behandlades; dokumentet behÃ¶ver granskas.`
    };
  } catch (error) {
    const failure = processingFailure(error);
    await completeAttempt(attempt.id, {
      status: failure.status,
      errorCode: failure.code,
      adminErrorMessage: failure.publicMessage,
      technicalErrorDetail: failure.technicalMessage,
      identifiedProductCount: 0,
      updatedProductCount: 0,
      failedProductCount: 0,
      failedRowCount: pageStagingFailure ? 1 : 0,
      pageCount: pageInspection?.pageCount,
      failedPageNumbers: pageInspection?.failedPageNumbers ?? [],
      extractionMethods: pageInspection?.extractionMethods ?? []
    });

    return {
      documentId,
      attemptId: attempt.id,
      attemptNumber: attempt.attempt_number,
      status: failure.status,
      identifiedProductCount: 0,
      updatedProductCount: 0,
      failedProductCount: 0,
      errorCode: failure.code,
      message: failure.publicMessage
    };
  }
}

async function loadDocument(id: string) {
  const [document] = await selectSupabaseRows<DocumentRow>("documents", {
    select: "id,file_name,storage_bucket,storage_path,pdf_sha256,deleted_at",
    id: `eq.${id}`,
    deleted_at: "is.null",
    limit: "1"
  });
  if (!document) throw new ProductDocumentNotFoundError("Product document not found.");
  return document;
}

async function downloadStoredPdf(document: DocumentRow) {
  if (!document.storage_bucket || !document.storage_path) {
    throw new Error("The product document has no private Storage object.");
  }
  return downloadAdminStorageObject(document.storage_bucket, document.storage_path);
}

async function stageExtraction(
  documentId: string,
  attemptId: string,
  extraction: ProductPdfExtractionPayload
) {
  const staged = prepareProductPdfForStaging(extraction);
  return callSupabaseRpc<StagingResult>("stage_product_document_extraction", {
    p_attempt_id: attemptId,
    p_document_id: documentId,
    p_products: staged.products,
    p_document_info: staged.documentInfo
  });
}

async function stageInspectedPages(
  documentId: string,
  attemptId: string,
  inspection: ProductDocumentPageInspection
): Promise<PageStagingFailure | null> {
  if (inspection.pages.length === 0) return null;

  try {
    await callSupabaseRpc("stage_product_document_pages", {
      p_attempt_id: attemptId,
      p_document_id: documentId,
      p_pages: inspection.pages
    });
    return null;
  } catch (error) {
    return {
      code: "unknown_error",
      publicMessage: "PDF-sidornas extraktionsresultat kunde inte sparas.",
      technicalMessage: safeTechnicalMessage(error)
    };
  }
}

type Completion = {
  status: ProductDocumentStatus;
  errorCode?: string | null;
  adminErrorMessage?: string | null;
  technicalErrorDetail?: string | null;
  identifiedProductCount: number;
  updatedProductCount: number;
  failedProductCount: number;
  failedRowCount: number;
  failedPageNumbers: number[];
  extractionMethods: string[];
  pageCount?: number | null;
  rawResult?: ProductPdfExtractionPayload | null;
};

async function completeAttempt(attemptId: string, completion: Completion) {
  return callSupabaseRpc<ProcessingAttempt>("complete_product_document_processing", {
    p_attempt_id: attemptId,
    p_status: completion.status,
    p_error_code: completion.errorCode ?? null,
    p_admin_error_message: completion.adminErrorMessage ?? null,
    p_technical_error_detail: completion.technicalErrorDetail ?? null,
    p_technical_stack_trace: null,
    p_identified_product_count: completion.identifiedProductCount,
    p_updated_product_count: completion.updatedProductCount,
    p_failed_product_count: completion.failedProductCount,
    p_failed_row_count: completion.failedRowCount,
    p_failed_page_numbers: completion.failedPageNumbers,
    p_extraction_methods: completion.extractionMethods,
    p_page_count: completion.pageCount ?? null,
    p_raw_result: completion.rawResult ?? null,
    p_metrics: {},
    p_retry_after: null
  });
}

function processingIdempotencyKey(document: DocumentRow, trigger: ProcessingTrigger) {
  const source =
    trigger === "initial" || trigger === "reader_upgrade"
      ? [document.pdf_sha256 ?? document.id, PRODUCT_PDF_READER_VERSION, trigger].join(":")
      : [document.id, PRODUCT_PDF_READER_VERSION, trigger, randomUUID()].join(":");
  return createHash("sha256").update(source).digest("hex");
}

function extractionMetadata(extraction: ProductPdfExtractionPayload) {
  const info = extraction.documentInfo;
  const pageCount = positiveInteger(info.pageCount ?? info.pages);
  const failedPageNumbers = integerArray(info.failedPageNumbers ?? info.failed_pages);
  const configuredMethods = stringArray(
    info.extractionMethods ?? info.extraction_methods
  );
  return {
    pageCount,
    failedPageNumbers,
    extractionMethods:
      configuredMethods.length > 0 ? configuredMethods : ["text", "table"]
  };
}

function extractionLanguageCode(extraction: ProductPdfExtractionPayload) {
  const value =
    extraction.documentInfo.languageCode ??
    extraction.documentInfo.language_code ??
    extraction.documentInfo.language;
  return typeof value === "string" ? value.trim().slice(0, 32) || null : null;
}

function pageInspectionFailure(
  inspection: ProductDocumentPageInspection
): PageStagingFailure | null {
  if (!inspection.errorCode) return null;
  return {
    code: inspection.errorCode,
    publicMessage:
      inspection.adminErrorMessage ?? "En eller flera PDF-sidor kunde inte lÃ¤sas.",
    technicalMessage:
      inspection.technicalErrorDetail ?? "A product document page could not be extracted."
  };
}

function processingFailure(error: unknown) {
  if (error instanceof ProductPdfServiceError) {
    return {
      status: error.classification.status,
      code: error.classification.code,
      publicMessage: error.classification.publicMessage,
      technicalMessage: error.technicalMessage.slice(0, 8_000)
    };
  }
  const technicalMessage =
    error instanceof Error ? `${error.name}: ${error.message}` : "Unknown processing error.";
  return {
    status: "failed" as const,
    code: "unknown_error",
    publicMessage: "Produktinformationen kunde inte sparas efter PDF-läsningen.",
    technicalMessage: technicalMessage.slice(0, 8_000)
  };
}

function nonNegativeInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function integerArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((item) => Number.isInteger(item) && item > 0))];
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string"))];
}

function uniqueIntegers(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function maximumInteger(...values: Array<number | null | undefined>) {
  const integers = values.filter(
    (value): value is number => Number.isInteger(value) && Number(value) > 0
  );
  return integers.length > 0 ? Math.max(...integers) : null;
}

function safeTechnicalMessage(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/[\r\n]+/g, " ").slice(0, 8_000);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
