"use client";

import {
  extractPdfPagesWithBrowserOcr,
  type BrowserOcrProgress
} from "./browser-pdf-ocr";

type OcrRequiredResponse = {
  code?: string;
  pageCount?: number;
  pageNumbers?: number[];
};

export async function uploadTechnicalDescriptionWithOcr(
  formData: FormData,
  file: File,
  onProgress?: (progress: BrowserOcrProgress) => void
) {
  onProgress?.({ label: "Läser PDF…" });
  let response = await fetch("/api/technical-descriptions", {
    method: "POST",
    body: formData
  });
  const payload = (await response.clone().json().catch(() => null)) as
    | OcrRequiredResponse
    | null;
  if (
    response.status !== 422 ||
    payload?.code !== "OCR_REQUIRED" ||
    !Array.isArray(payload.pageNumbers)
  ) {
    return response;
  }

  const ocrPages = await extractPdfPagesWithBrowserOcr(
    file,
    payload.pageNumbers,
    onProgress
  );
  if (!ocrPages.some((page) => page.text.trim().length > 0)) {
    throw new Error(
      "OCR kunde inte läsa dokumentet. Kontrollera att sidorna är tydliga och försök igen."
    );
  }

  formData.set("ocrPages", JSON.stringify(ocrPages));
  formData.set("ocrRetry", "true");
  onProgress?.({ label: "Skapar produktrader från OCR-resultatet…" });
  response = await fetch("/api/technical-descriptions", {
    method: "POST",
    body: formData
  });
  return response;
}
