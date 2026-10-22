import type { TechnicalDescriptionPage } from "@/modules/technical-description-extractor/types";

export type StagedProductDocumentPage = {
  page_number: number;
  status: "success" | "partial" | "failed";
  extraction_method: "text" | "ocr" | "table" | "mixed";
  language_code?: string;
  extracted_text: string;
  extracted_tables: unknown[];
  source_coordinates: unknown[];
  error_code?: "ocr_failed" | "text_extraction_failed" | "table_extraction_failed";
  error_message?: string;
};

export function prepareProductDocumentPages(
  pages: TechnicalDescriptionPage[],
  languageCode?: string | null
): StagedProductDocumentPage[] {
  return pages
    .filter((page) => Number.isInteger(page.pageNumber) && page.pageNumber > 0)
    .map((page) => {
      const status = page.status ?? (page.errorCode ? "partial" : "success");
      return {
        page_number: page.pageNumber,
        status,
        extraction_method: page.method,
        ...(languageCode ? { language_code: languageCode } : {}),
        extracted_text: page.text,
        extracted_tables: [],
        source_coordinates: [],
        ...(page.errorCode ? { error_code: page.errorCode } : {}),
        ...(page.errorMessage ? { error_message: page.errorMessage } : {})
      };
    });
}

export function mergeExtractorPageDetails(
  pages: StagedProductDocumentPage[],
  extractorPages: Record<string, unknown>[],
  languageCode?: string | null
) {
  const merged = new Map(pages.map((page) => [page.page_number, page]));

  for (const detail of extractorPages) {
    const pageNumber = positiveInteger(detail.page_number ?? detail.pageNumber);
    if (!pageNumber) continue;
    const current = merged.get(pageNumber);
    const tables = arrayValue(detail.extracted_tables ?? detail.tables);
    const coordinates = arrayValue(detail.source_coordinates ?? detail.sourceCoordinates);
    const extractedText = stringValue(detail.extracted_text ?? detail.text);
    const errorCode = supportedPageErrorCode(detail.error_code ?? detail.errorCode);
    const errorMessage = stringValue(detail.error_message ?? detail.errorMessage);
    const status = supportedPageStatus(detail.status) ?? current?.status ?? "success";
    const configuredMethod = supportedExtractionMethod(
      detail.extraction_method ?? detail.extractionMethod
    );
    const extractionMethod =
      configuredMethod ??
      (tables.length > 0
        ? current?.extracted_text || extractedText
          ? "mixed"
          : "table"
        : current?.extraction_method ?? "text");

    merged.set(pageNumber, {
      page_number: pageNumber,
      status,
      extraction_method: extractionMethod,
      ...(stringValue(detail.language_code ?? detail.languageCode) ?? languageCode
        ? {
            language_code:
              stringValue(detail.language_code ?? detail.languageCode) ??
              languageCode ??
              undefined
          }
        : {}),
      extracted_text: extractedText ?? current?.extracted_text ?? "",
      extracted_tables: tables.length > 0 ? tables : current?.extracted_tables ?? [],
      source_coordinates:
        coordinates.length > 0 ? coordinates : current?.source_coordinates ?? [],
      ...(errorCode ? { error_code: errorCode } : current?.error_code ? { error_code: current.error_code } : {}),
      ...(errorMessage
        ? { error_message: errorMessage }
        : current?.error_message
          ? { error_message: current.error_message }
          : {})
    });
  }

  return [...merged.values()].sort((left, right) => left.page_number - right.page_number);
}

export function detectProductDocumentLanguage(
  pages: Array<Pick<TechnicalDescriptionPage, "text">>
) {
  const text = pages.map((page) => page.text).join(" ").toLocaleLowerCase();
  const vocabularies: Record<string, string[]> = {
    sv: ["och", "eller", "produkt", "tekniska", "godkÃ¤nnande", "tryck"],
    no: ["og", "eller", "produkt", "tekniske", "godkjenning", "trykk"],
    en: ["and", "or", "product", "technical", "approval", "pressure"]
  };
  const scores = Object.entries(vocabularies).map(([language, words]) => ({
    language,
    score: words.reduce(
      (total, word) => total + (new RegExp(`(?:^|\\W)${word}(?:$|\\W)`, "gu").test(text) ? 1 : 0),
      0
    )
  }));
  scores.sort((left, right) => right.score - left.score);

  return scores[0] && scores[0].score >= 2 && scores[0].score > (scores[1]?.score ?? 0)
    ? scores[0].language
    : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function supportedPageStatus(value: unknown) {
  return value === "success" || value === "partial" || value === "failed"
    ? value
    : null;
}

function supportedExtractionMethod(value: unknown) {
  return value === "text" || value === "ocr" || value === "table" || value === "mixed"
    ? value
    : null;
}

function supportedPageErrorCode(value: unknown) {
  return value === "ocr_failed" ||
    value === "text_extraction_failed" ||
    value === "table_extraction_failed"
    ? value
    : null;
}
