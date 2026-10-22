export const PRODUCT_DOCUMENT_STATUSES = [
  "pending",
  "processing",
  "success",
  "partial",
  "no_products_found",
  "unreadable",
  "failed"
] as const;

export type ProductDocumentStatus = (typeof PRODUCT_DOCUMENT_STATUSES)[number];

export const PRODUCT_DOCUMENT_ERROR_CODES = [
  "encrypted_pdf",
  "password_protected",
  "corrupt_file",
  "invalid_pdf",
  "empty_document",
  "image_only_pdf",
  "ocr_failed",
  "text_extraction_failed",
  "table_extraction_failed",
  "unsupported_encoding",
  "timeout",
  "out_of_memory",
  "no_product_identifiers",
  "no_products_found",
  "extractor_unavailable",
  "unknown_error"
] as const;

export type ProductDocumentErrorCode =
  (typeof PRODUCT_DOCUMENT_ERROR_CODES)[number];

export type ProductPdfExtractionPayload = {
  products: Record<string, unknown>[];
  accessories: Record<string, unknown>[];
  documentInfo: Record<string, unknown>;
  pages?: Record<string, unknown>[];
};

export type ClassifiedProductPdfError = {
  status: Extract<ProductDocumentStatus, "unreadable" | "failed" | "no_products_found">;
  code: ProductDocumentErrorCode;
  publicMessage: string;
  retryable: boolean;
};

export function parseProductPdfPayload(value: unknown): ProductPdfExtractionPayload | null {
  if (!isRecord(value) || !Array.isArray(value.products)) return null;

  return {
    products: value.products.filter(isRecord),
    accessories: Array.isArray(value.accessories)
      ? value.accessories.filter(isRecord)
      : [],
    documentInfo: isRecord(value.documentInfo) ? value.documentInfo : {},
    pages: Array.isArray(value.pages) ? value.pages.filter(isRecord) : []
  };
}

export function classifyProductPdfError(
  message: string,
  httpStatus?: number
): ClassifiedProductPdfError {
  const normalized = message.toLocaleLowerCase();

  if (httpStatus === 415 || includesAny(normalized, ["not a pdf", "file is not a pdf"])) {
    return permanent("invalid_pdf", "Filen är inte en giltig PDF.");
  }
  if (includesAny(normalized, [
    "password protected",
    "password-protected",
    "pdfpasswordincorrect",
    "incorrect password"
  ])) {
    return permanent("password_protected", "PDF-filen är lösenordsskyddad.");
  }
  if (includesAny(normalized, ["encrypted", "encryption"])) {
    return permanent("encrypted_pdf", "PDF-filen är krypterad och kan inte läsas.");
  }
  if (includesAny(normalized, [
    "corrupt",
    "damaged",
    "malformed pdf",
    "pdfsyntaxerror",
    "no /root object",
    "broken xref"
  ])) {
    return permanent("corrupt_file", "PDF-filen verkar vara skadad.");
  }
  if (includesAny(normalized, ["no pages", "empty document", "zero pages"])) {
    return permanent("empty_document", "PDF-filen innehåller inga läsbara sidor.");
  }
  if (includesAny(normalized, ["image only", "image-only", "no text layer"])) {
    return permanent("image_only_pdf", "PDF-filen saknar textlager och kräver OCR.");
  }
  if (includesAny(normalized, ["ocr failed", "tesseract"])) {
    return retryable("ocr_failed", "OCR-behandlingen misslyckades.");
  }
  if (includesAny(normalized, [
    "no products",
    "no unique product",
    "no product identifiers",
    "no coupling style",
    "no style numbers",
    "no sprinkler sin",
    "no sin values",
    "no model numbers"
  ])) {
    return {
      status: "no_products_found",
      code: includesAny(normalized, ["identifier", "style", "sin", "model"])
        ? "no_product_identifiers"
        : "no_products_found",
      publicMessage: "Dokumentet kunde läsas men inga säkra produkter hittades.",
      retryable: false
    };
  }
  if (includesAny(normalized, ["table", "column", "row", "sin header"])) {
    return permanent(
      "table_extraction_failed",
      "Produktinformationen i dokumentets tabeller kunde inte läsas säkert."
    );
  }
  if (includesAny(normalized, ["timeout", "timed out", "aborted"])) {
    return retryable("timeout", "PDF-behandlingen tog för lång tid.");
  }
  if (includesAny(normalized, ["out of memory", "heap", "allocation failed"])) {
    return retryable("out_of_memory", "PDF-behandlingen fick slut på tillgängligt minne.");
  }
  if (httpStatus && httpStatus >= 500) {
    return retryable("extractor_unavailable", "PDF-läsaren är tillfälligt otillgänglig.");
  }
  if (httpStatus === 422) {
    return permanent(
      "table_extraction_failed",
      "PDF-läsaren kunde inte tolka produktinformationen i dokumentet."
    );
  }

  return retryable("unknown_error", "PDF-filen kunde inte behandlas.");
}

function permanent(
  code: ProductDocumentErrorCode,
  publicMessage: string
): ClassifiedProductPdfError {
  return { status: "unreadable", code, publicMessage, retryable: false };
}

function retryable(
  code: ProductDocumentErrorCode,
  publicMessage: string
): ClassifiedProductPdfError {
  return { status: "failed", code, publicMessage, retryable: true };
}

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
