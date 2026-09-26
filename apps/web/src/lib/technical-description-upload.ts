"use client";

import { extractPdfPagesWithBrowserOcr } from "./browser-pdf-ocr";
import { uploadTechnicalDescription, type PdfUploadProgress } from "./technical-description-upload-flow";

export type { PdfUploadProgress } from "./technical-description-upload-flow";

export function uploadTechnicalDescriptionWithOcr(
  formData: FormData,
  file: File,
  onProgress?: (progress: PdfUploadProgress) => void
) {
  return uploadTechnicalDescription(formData, file, {
    fetch: globalThis.fetch.bind(globalThis),
    extractOcr: extractPdfPagesWithBrowserOcr
  }, onProgress);
}
