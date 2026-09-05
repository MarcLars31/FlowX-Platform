import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";

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
  expectedPageCount: number
): ClientOcrPage[] | undefined {
  if (value === null) return undefined;
  if (typeof value !== "string") {
    throw new ClientOcrPayloadError("OCR-resultatet måste vara textdata.");
  }
  if (value.length > MAX_CLIENT_OCR_TOTAL_CHARACTERS) {
    throw new ClientOcrPayloadError("OCR-resultatet är för stort.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ClientOcrPayloadError("OCR-resultatet är inte giltig JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_CLIENT_OCR_PAGES) {
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
      pageNumber > expectedPageCount ||
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
  minimumReadableLength = 80
): TechnicalDescriptionPage[] {
  if (!clientPages?.length) return [...serverPages];
  const clientByPage = new Map(
    clientPages.map((page) => [page.pageNumber, page] as const)
  );

  return serverPages.map((serverPage) => {
    if (serverPage.text.length >= minimumReadableLength) return serverPage;
    const clientPage = clientByPage.get(serverPage.pageNumber);
    if (!clientPage?.text) return serverPage;
    const readable = clientPage.text.length >= minimumReadableLength;
    return {
      pageNumber: serverPage.pageNumber,
      text: clientPage.text,
      method: "ocr",
      confidence: Math.min(Math.max(clientPage.confidence, 0.45), 0.96),
      status: readable ? "success" : "partial",
      errorCode: readable ? undefined : "ocr_failed",
      errorMessage: readable
        ? undefined
        : "OCR gav för lite läsbar text. Sidan behöver granskas."
    };
  });
}
