import "server-only";
import {
  classifyProductPdfError,
  parseProductPdfPayload,
  type ClassifiedProductPdfError,
  type ProductPdfExtractionPayload
} from "@/lib/product-pdf-processing";

const DEFAULT_TIMEOUT_MS = 120_000;

export class ProductPdfServiceError extends Error {
  constructor(
    readonly classification: ClassifiedProductPdfError,
    readonly technicalMessage: string
  ) {
    super(classification.publicMessage);
    this.name = "ProductPdfServiceError";
  }
}

export function isProductPdfExtractorConfigured() {
  return Boolean(productPdfExtractorUrl());
}

export async function extractProductPdf(
  file: Uint8Array,
  fileName: string
): Promise<ProductPdfExtractionPayload> {
  const baseUrl = productPdfExtractorUrl();
  if (!baseUrl) {
    throw new ProductPdfServiceError(
      classifyProductPdfError("extractor unavailable", 503),
      "PRODUCT_PDF_EXTRACTOR_URL is not configured."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), extractorTimeoutMs());

  try {
    const form = new FormData();
    const fileCopy = new Uint8Array(file.byteLength);
    fileCopy.set(file);
    form.set(
      "file",
      new Blob([fileCopy.buffer], { type: "application/pdf" }),
      safeFileName(fileName)
    );
    const response = await fetch(new URL("extract", ensureTrailingSlash(baseUrl)), {
      method: "POST",
      body: form,
      signal: controller.signal,
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const detail = extractorErrorDetail(payload) ?? `Extractor HTTP ${response.status}`;
      throw new ProductPdfServiceError(
        classifyProductPdfError(detail, response.status),
        detail
      );
    }

    const parsed = parseProductPdfPayload(payload);
    if (!parsed) {
      throw new ProductPdfServiceError(
        classifyProductPdfError("invalid extractor response"),
        "Product PDF Extractor returned an invalid response shape."
      );
    }

    if (parsed.products.length === 0) {
      throw new ProductPdfServiceError(
        classifyProductPdfError("no products found", 422),
        "Product PDF Extractor returned no products."
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof ProductPdfServiceError) throw error;

    const technicalMessage =
      error instanceof Error ? `${error.name}: ${error.message}` : "Unknown extractor failure.";
    throw new ProductPdfServiceError(
      classifyProductPdfError(technicalMessage),
      technicalMessage
    );
  } finally {
    clearTimeout(timeout);
  }
}

function productPdfExtractorUrl() {
  const value = process.env.PRODUCT_PDF_EXTRACTOR_URL?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractorTimeoutMs() {
  const configured = Number(process.env.PRODUCT_PDF_EXTRACTOR_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 5_000 && configured <= 600_000
    ? Math.floor(configured)
    : DEFAULT_TIMEOUT_MS;
}

function extractorErrorDetail(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const detail = (payload as Record<string, unknown>).detail;
  if (typeof detail === "string") return detail.slice(0, 2_000);
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;

  const record = detail as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  return [code, message].filter(Boolean).join(": ").slice(0, 2_000) || null;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "datasheet.pdf";
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
