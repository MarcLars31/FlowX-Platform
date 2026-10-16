import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";

import { pageRequiresOcr, MIN_TEXT_PAGE_LENGTH } from "@/modules/technical-description-extractor/pdf-ocr-detection";

const MAX_CLIENT_OCR_PAGES = 300;
const MAX_CLIENT_OCR_PAGE_CHARACTERS = 300_000;
const MAX_CLIENT_OCR_TOTAL_CHARACTERS = 5_000_000;

export type ClientOcrPage = {
  pageNumber: number;
  text: string;
  confidence: number;
};

export class ClientOcrPayloadError extends Error {}

export function parseClientOcrPages(
  value: FormDataEntryValue | null,
  expectedPageCount: number,
  limits: {maxPages?: number; maxBytes?: number} = {}
): ClientOcrPage[] | undefined {
  if (value === null) return undefined;
  if (typeof value !== "string") {
    throw new ClientOcrPayloadError("OCR-resultatet måste vara textdata.");
  }
  if (new TextEncoder().encode(value).byteLength > (limits.maxBytes ?? 4_000_000)) {
    throw new ClientOcrPayloadError("OCR-resultatet är för stort.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ClientOcrPayloadError("OCR-resultatet är inte giltig JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length > (limits.maxPages ?? MAX_CLIENT_OCR_PAGES)) {
    throw new ClientOcrPayloadError("OCR-resultatet innehåller för många sidor.");
  }

  const seen = new Set<number>();
  let totalCharacters = 0;
  return parsed.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new ClientOcrPayloadError("OCR-resultatet innehåller en ogiltig sida.");
    }
    const page = candidate as Record<string, unknown>;
    const pageNumber = page.pageNumber;
    const text = page.text;
    const confidence = page.confidence;
    if (
      !Number.isInteger(pageNumber) ||
      typeof pageNumber !== "number" ||
      pageNumber < 1 ||
      !Number.isInteger(expectedPageCount) || pageNumber > expectedPageCount ||
      seen.has(pageNumber)
    ) {
      throw new ClientOcrPayloadError("OCR-resultatet har ett ogiltigt sidnummer.");
    }
    if (
      typeof text !== "string" ||
      text.length > MAX_CLIENT_OCR_PAGE_CHARACTERS
    ) {
      throw new ClientOcrPayloadError("OCR-texten för en sida är ogiltig eller för stor.");
    }
    if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
      throw new ClientOcrPayloadError("OCR-resultatet saknar giltig konfidens.");
    }

    seen.add(pageNumber);
    totalCharacters += text.length;
    if (totalCharacters > MAX_CLIENT_OCR_TOTAL_CHARACTERS) {
      throw new ClientOcrPayloadError("OCR-resultatet är för stort.");
    }
    return {
      pageNumber,
      text: text.replace(/\0/g, "").trim(),
      confidence: Math.min(Math.max(confidence, 0), 1)
    };
  });
}

export function mergeClientOcrPages(
  serverPages: readonly TechnicalDescriptionPage[],
  clientPages: readonly ClientOcrPage[] | undefined,
  minimumReadableLength = MIN_TEXT_PAGE_LENGTH
): TechnicalDescriptionPage[] {
  if (!clientPages?.length) return [...serverPages];
  const clientByPage = new Map(
    clientPages.map((page) => [page.pageNumber, page] as const)
  );

  return serverPages.map((serverPage) => {
    if (!pageRequiresOcr(serverPage, minimumReadableLength)) return serverPage;
    const clientPage = clientByPage.get(serverPage.pageNumber);
    if (!clientPage?.text.trim()) return serverPage;
    // Reading only the same digital header has not recovered the image body.
    if (serverPage.ocrReason && clientPage.text.replace(/\s+/g, "") === serverPage.text.replace(/\s+/g, "")) return serverPage;
    const readable = clientPage.text.length >= minimumReadableLength && clientPage.confidence >= 0.7;
    return {
      ...serverPage,
      pageNumber: serverPage.pageNumber,
      text: clientPage.text,
      // Digital coordinates/line indices no longer describe the replacement OCR text.
      postTable: undefined,
      ocrReason: readable ? undefined : serverPage.ocrReason,
      method: "ocr",
      confidence: Math.min(Math.max(clientPage.confidence, 0), 1),
      status: readable ? "success" : "partial",
      errorCode: readable ? undefined : "ocr_failed",
      errorMessage: readable
        ? undefined
        : clientPage.confidence < 0.7
          ? "OCR-texten har låg säkerhet. Kontrollera postnummer, mängder och krav mot originalet."
          : "OCR gav för lite läsbar text. Sidan behöver granskas."
    };
  });
}
