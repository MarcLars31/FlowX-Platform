import { ocrHeadingLayout, pdfPostHeadingSources } from "@/modules/technical-description-extractor/pdf-heading-layout";
import { sitePostTableFromPdfItems } from "@/modules/technical-description-extractor/pdf-post-table";
import { pdfPostInventoryFromItems } from "@/modules/technical-description-extractor/post-inventory";
import { pdfPostMeasurementCells } from "@/modules/technical-description-extractor/pdf-post-measurements";
import { separateOcrPriceText } from "@/modules/technical-description-extractor/pdf-ocr-columns";
import type { PositionedWord } from "@/modules/technical-description-extractor/pdf-price-columns";
import { mergePdfPageSource } from "./pdf-page-source-merge";
import { textPostInventory } from "@/modules/technical-description-extractor/post-inventory";
import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";

import { pageRequiresOcr, MIN_TEXT_PAGE_LENGTH } from "@/modules/technical-description-extractor/pdf-ocr-detection";

const MAX_CLIENT_OCR_PAGES = 300;
const MAX_CLIENT_OCR_PAGE_CHARACTERS = 300_000;
const MAX_CLIENT_OCR_TOTAL_CHARACTERS = 5_000_000;

export type ClientOcrPage = {
  pageNumber: number;
  text: string;
  confidence: number;
  words?: PositionedWord[];
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

    let words: PositionedWord[] | undefined;
    if (page.words !== undefined) {
      if (!Array.isArray(page.words) || page.words.length > 10_000) throw new ClientOcrPayloadError("OCR-positionerna är ogiltiga eller för många.");
      let wordCharacters = 0;
      words = page.words.map(value => {
        const word = value as PositionedWord | null;
        if (!word || typeof word.text !== "string" || word.text.length > 10_000 || !word.bbox
          || ![word.bbox.x0, word.bbox.y0, word.bbox.x1, word.bbox.y1].every(n => Number.isFinite(n) && n >= 0 && n <= 20_000)
          || word.bbox.x1 < word.bbox.x0 || word.bbox.y1 < word.bbox.y0) throw new ClientOcrPayloadError("OCR-positionerna är ogiltiga.");
        wordCharacters += word.text.length;
        if (wordCharacters > MAX_CLIENT_OCR_PAGE_CHARACTERS) throw new ClientOcrPayloadError("OCR-positionerna är för stora.");
        return { text: word.text.replace(/\0/g, "").trim(), bbox: { x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 } };
      });
      totalCharacters += wordCharacters;
    }
    seen.add(pageNumber);
    totalCharacters += text.length;
    if (totalCharacters > MAX_CLIENT_OCR_TOTAL_CHARACTERS) {
      throw new ClientOcrPayloadError("OCR-resultatet är för stort.");
    }
    return {
      pageNumber,
      ...(words ? { words } : {}),
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
    const rawClientPage = clientByPage.get(serverPage.pageNumber);
    if (!rawClientPage?.text.trim()) return serverPage;
    const separated = separateOcrPriceText(rawClientPage.text, rawClientPage.words);
    const clientPage = { ...rawClientPage, text: separated.text };
    // Reading only the same digital header has not recovered the image body.
    if (serverPage.ocrReason && clientPage.text.replace(/\s+/g, "") === serverPage.text.replace(/\s+/g, "")) return serverPage;
    const readable = clientPage.text.length >= minimumReadableLength && clientPage.confidence >= 0.7;
    // The OCR text can miss a number that was readable digitally. Keep those
    // independent source blocks too, without reusing obsolete table line indices.
    const merged = mergePdfPageSource(serverPage, clientPage.text);
    const retainedDigitalIssues = merged.supplemented && serverPage.priceColumns?.status === "review"
      ? serverPage.priceColumns.issues.map(issue => `digital:${issue}`) : [];
    const priceColumns = { ...separated.priceColumns,
      ...(retainedDigitalIssues.length ? { status: "review" as const, issues: [...separated.priceColumns.issues, ...retainedDigitalIssues] } : {}) };
    const positioned = separated.words?.map(word => ({str:word.text, width:word.bbox.x1-word.bbox.x0,
      height:word.bbox.y1-word.bbox.y0, transform:[1,0,0,word.bbox.y1-word.bbox.y0,word.bbox.x0,-word.bbox.y0]}));
    const postTable = positioned && !merged.supplemented ? sitePostTableFromPdfItems(positioned,true,priceColumns.tables) : undefined;
    const postInventory = postTable && positioned ? pdfPostInventoryFromItems(positioned)! : textPostInventory(merged.text);
    const remaining = [...postInventory.posts];
    for (const post of serverPage.postInventory?.posts ?? []) {
      const index = remaining.findIndex(candidate => candidate.postNumber === post.postNumber);
      if (index >= 0) remaining.splice(index, 1);
      else postInventory.posts.push(post);
    }
    return {
      ...serverPage,
      pageNumber: serverPage.pageNumber,
      text: merged.text,
      priceColumns,
      headingLayout: rawClientPage.words ? ocrHeadingLayout(rawClientPage.words, separated.priceColumns.tables) : undefined,
      headingSources: postTable && positioned ? pdfPostHeadingSources(positioned,priceColumns.tables) : undefined,
      priceColumnReadings: { digital: serverPage.priceColumns, ocr: separated.priceColumns },
      sourceTextMerge: merged.supplemented,
      sourceReadings: { digital: serverPage.text, ocr: clientPage.text },
      // Digital coordinates/line indices no longer describe the replacement OCR text.
      postTable,
      ...(postTable && positioned ? {sourcePostColumns:pdfPostMeasurementCells(positioned,priceColumns.tables)} : {}),
      postInventory,
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
