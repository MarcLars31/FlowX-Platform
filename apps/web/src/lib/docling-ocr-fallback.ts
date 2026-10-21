import { pageRequiresOcr, MIN_TEXT_PAGE_LENGTH } from "@/modules/technical-description-extractor/pdf-ocr-detection";
import { textPostInventory } from "@/modules/technical-description-extractor/post-inventory";
import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";
import { mergeClientOcrPages, type ClientOcrPage } from "./technical-description-ocr-payload";

export const DOCLING_OCR_VERSION = "docling-rapidocr-v1";
export type DoclingAttempt = {
  version: typeof DOCLING_OCR_VERSION;
  status: "accepted" | "rejected" | "unavailable";
  reason?: string;
};

export function failedOcrPageNumbers(original: readonly TechnicalDescriptionPage[],
  merged: readonly TechnicalDescriptionPage[], attempted: readonly ClientOcrPage[]) {
  const attempts = new Set(attempted.map(page => page.pageNumber));
  const byPage = new Map(merged.map(page => [page.pageNumber, page]));
  return original.filter(page => {
    const current = byPage.get(page.pageNumber);
    return attempts.has(page.pageNumber) && pageRequiresOcr(page) && current
      && (current.status === "partial" || current.status === "failed" || current.confidence < .7
        || Boolean(current.errorCode) || pageRequiresOcr(current));
  }).map(page => page.pageNumber);
}

/** Do not let a plausible alternate reading silently remove known source posts. */
export function applyDoclingOcr(original: TechnicalDescriptionPage, current: TechnicalDescriptionPage,
  candidate: ClientOcrPage): TechnicalDescriptionPage {
  const known = current.sourceReadings?.ocr ?? (current.method === "ocr" ? current.text : "");
  const ids = textPostInventory(known).posts.map(post => post.postNumber);
  const candidateIds = new Set(textPostInventory(candidate.text).posts.map(post => post.postNumber));
  const codes = [...known.matchAll(/\b[A-ZÆØÅ]{2}\d[\w.%-]*/g)].map(match => match[0]);
  const accepted = candidate.pageNumber === original.pageNumber && Number.isFinite(candidate.confidence)
    && candidate.confidence >= .7 && candidate.text.trim().length >= MIN_TEXT_PAGE_LENGTH
    && candidate.text.replace(/\s/g, "").length >= known.replace(/\s/g, "").length * .8
    && ids.every(id => candidateIds.has(id)) && codes.every(code => candidate.text.includes(code));
  const [replacement] = accepted ? mergeClientOcrPages([original], [candidate]) : [current];
  const recovered = accepted && replacement.method === "ocr" && replacement.status === "success";
  return {
    ...(recovered ? replacement : current),
    sourceReadings: { digital: original.text, ocr: recovered ? candidate.text : known,
      primaryOcr: known, docling: candidate.text },
    ocrFallback: { version: DOCLING_OCR_VERSION, status: recovered ? "accepted" : "rejected",
      ...(!recovered ? { reason: "insufficient_or_conflicting_reading" } : {}) }
  };
}
