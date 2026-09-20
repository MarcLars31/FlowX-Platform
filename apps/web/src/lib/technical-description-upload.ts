"use client";

import { extractPdfPagesWithBrowserOcr } from "./browser-pdf-ocr";

export type PdfUploadProgress = { label: string; percent: number };

type OcrRequiredResponse = {
  code?: string;
  pageCount?: number;
  pageNumbers?: number[];
};

export async function uploadTechnicalDescriptionWithOcr(
  formData: FormData,
  file: File,
  onProgress?: (progress: PdfUploadProgress) => void
) {
  let currentPercent = 0;
  const reportProgress = (percent: number) => {
    // Retries can restart a page's OCR counter; the document counter must not go backwards.
    if (!Number.isFinite(percent)) return;
    currentPercent = Math.max(currentPercent, Math.min(100, Math.round(percent)));
    onProgress?.({ label: `${currentPercent} %`, percent: currentPercent });
  };
  reportProgress(0);
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
    if (response.ok) reportProgress(100);
    return response;
  }

  // Reserve the final percentage for saving the result on the server.
  const ocrPages = await extractPdfPagesWithBrowserOcr(
    file,
    payload.pageNumbers,
    (progress) => reportProgress((progress.progress ?? 0) * 95)
  );
  if (!ocrPages.some((page) => page.text.trim().length > 0)) {
    throw new Error(
      "PDF-filen kunde inte läsas. Kontrollera att sidorna är tydliga och försök igen."
    );
  }

  formData.set("ocrPages", JSON.stringify(ocrPages));
  formData.set("ocrRetry", "true");
  reportProgress(99);
  response = await fetch("/api/technical-descriptions", {
    method: "POST",
    body: formData
  });
  if (response.ok) reportProgress(100);
  return response;
}
