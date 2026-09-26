import { validateTechnicalDescriptionFile } from "./technical-description-file";
import type { ClientOcrPage } from "./technical-description-ocr-payload";

export type PdfUploadProgress = { label: string; percent: number };

type UploadDependencies = {
  fetch: typeof fetch;
  extractOcr: (
    file: File,
    pageNumbers: number[],
    onProgress: (progress: { progress?: number }) => void
  ) => Promise<ClientOcrPage[]>;
};

export async function uploadTechnicalDescription(
  formData: FormData,
  file: File,
  dependencies: UploadDependencies,
  onProgress?: (progress: PdfUploadProgress) => void
) {
  const validationError = validateTechnicalDescriptionFile(file);
  if (validationError) throw new Error(validationError);
  let currentPercent = 0;
  const reportProgress = (percent: number) => {
    if (!Number.isFinite(percent)) return;
    currentPercent = Math.max(currentPercent, Math.min(100, Math.round(percent)));
    onProgress?.({ label: `${currentPercent} %`, percent: currentPercent });
  };
  reportProgress(0);
  const setup = await dependencies.fetch("/api/technical-descriptions/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size, contentType: file.type })
  });
  if (!setup.ok) return readableUploadResponse(setup);
  const staged = await setup.json() as { uploadId?: unknown; signedUrl?: unknown };
  if (typeof staged.uploadId !== "string" || typeof staged.signedUrl !== "string") {
    throw new Error("Filopplastingen kunne ikke klargjøres. Prøv igjen.");
  }

  let completed = false;
  try {
    reportProgress(5);
    const stored = await dependencies.fetch(staged.signedUrl, {
      method: "PUT",
      credentials: "omit",
      headers: { "Content-Type": "application/pdf", "Cache-Control": "max-age=0" },
      body: file
    });
    if (!stored.ok) {
      throw new Error(stored.status === 413
        ? "Fillagringen avviste PDF-filens størrelse. Maksimalt 30 MB er tillatt."
        : "PDF-filen kunne ikke lastes opp til fillagringen. Prøv igjen.");
    }
    reportProgress(30);
    const analysis = new FormData();
    // Explicitly omit every File/Blob, including the PDF on the OCR retry.
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && !["file", "uploadId", "fileName"].includes(key)) {
        analysis.append(key, value);
      }
    }
    analysis.set("uploadId", staged.uploadId);
    analysis.set("fileName", file.name);
    let response = await dependencies.fetch("/api/technical-descriptions", {
      method: "POST", body: analysis
    });
    const payload = await response.clone().json().catch(() => null) as {
      code?: string; pageNumbers?: number[];
    } | null;
    if (response.status === 422 && payload?.code === "OCR_REQUIRED" && Array.isArray(payload.pageNumbers)) {
      const ocrPages = await dependencies.extractOcr(
        file, payload.pageNumbers,
        progress => reportProgress(30 + (progress.progress ?? 0) * 65)
      );
      if (!ocrPages.some(page => page.text.trim().length > 0)) {
        throw new Error("PDF-filen kunne ikke leses. Kontroller at sidene er tydelige og prøv igjen.");
      }
      analysis.set("ocrPages", JSON.stringify(ocrPages));
      analysis.set("ocrRetry", "true");
      reportProgress(99);
      response = await dependencies.fetch("/api/technical-descriptions", {
        method: "POST", body: analysis
      });
    }
    completed = response.ok;
    if (completed) reportProgress(100);
    return readableUploadResponse(response);
  } finally {
    if (!completed) {
      // The server cleans up successful analyses; this covers failed uploads
      // and failures during OCR in the browser. Do not mask the original error.
      await dependencies.fetch("/api/technical-descriptions/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: staged.uploadId }),
        signal: AbortSignal.timeout(10_000)
      }).catch(() => undefined);
    }
  }
}

async function readableUploadResponse(response: Response) {
  if (response.ok) return response;
  const payload = await response.clone().json().catch(() => null) as { error?: unknown } | null;
  if (typeof payload?.error === "string") return response;
  return Response.json({
    error: response.status === 413
      ? "Opplastingsdataene er for store. Prøv et mindre dokument eller færre skannede sider."
      : "Scipx kunne ikke behandle PDF-filen. Prøv igjen."
  }, { status: response.status });
}
