import type { TechnicalDescriptionExtractionResult } from "@/modules/technical-description-extractor";

export type ExtractionQualitySummary = {
  warningCount: number;
  incompletePageCount: number;
  incompletePages: number[];
  quantityPageCount: number;
  quantityPages: number[];
};

/** Keep import notifications bounded even for documents with thousands of pages. */
export function extractionQualitySummary(result: Pick<TechnicalDescriptionExtractionResult, "warnings" | "pageChecks">): ExtractionQualitySummary {
  const incomplete = [...new Set(result.warnings.filter(warning => warning.code === "PAGE_EXTRACTION_INCOMPLETE")
    .flatMap(warning => typeof warning.sourcePage === "number" ? [warning.sourcePage] : []))].sort((a, b) => a - b);
  const quantities = [...new Set([
    ...(result.pageChecks ?? []).filter(page => page.unresolvedQuantityRows > 0).map(page => page.sourcePage),
    ...result.warnings.filter(warning => ["PDF_QUANTITY_COLUMNS_UNRECOGNIZED", "UNRESOLVED_QUANTITY_ROWS"].includes(warning.code))
      .flatMap(warning => typeof warning.sourcePage === "number" ? [warning.sourcePage] : [])
  ])].sort((a, b) => a - b);
  return { warningCount: result.warnings.filter(warning => warning.severity === "warning").length,
    incompletePageCount: incomplete.length, incompletePages: incomplete.slice(0, 100),
    quantityPageCount: quantities.length, quantityPages: quantities.slice(0, 100) };
}
