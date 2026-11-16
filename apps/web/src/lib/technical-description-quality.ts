import type { TechnicalDescriptionExtractionResult } from "@/modules/technical-description-extractor";

export type ExtractionQualitySummary = {
  warningCount: number;
  incompletePageCount: number;
  incompletePages: number[];
  quantityPageCount: number;
  quantityPages: number[];
  postPageCount?: number;
  postPages?: number[];
  observedPostCount?: number;
  representedPostCount?: number;
  recoveredPostCount?: number;
  unresolvedPostCount?: number;
};

/** Keep import notifications bounded even for documents with thousands of pages. */
export function extractionQualitySummary(result: Pick<TechnicalDescriptionExtractionResult, "warnings" | "pageChecks" | "postChecks">): ExtractionQualitySummary {
  const incomplete = [...new Set(result.warnings.filter(warning => warning.code === "PAGE_EXTRACTION_INCOMPLETE")
    .flatMap(warning => typeof warning.sourcePage === "number" ? [warning.sourcePage] : []))].sort((a, b) => a - b);
  const quantities = [...new Set([
    ...(result.pageChecks ?? []).filter(page => page.unresolvedQuantityRows > 0).map(page => page.sourcePage),
    ...result.warnings.filter(warning => ["PDF_QUANTITY_COLUMNS_UNRECOGNIZED", "UNRESOLVED_QUANTITY_ROWS"].includes(warning.code))
      .flatMap(warning => typeof warning.sourcePage === "number" ? [warning.sourcePage] : [])
  ])].sort((a, b) => a - b);
  const postPages = (result.postChecks ?? []).filter(page => page.status === "requires_review").map(page => page.sourcePage);
  const count = (key: "observedPostNumbers" | "representedPostNumbers" | "recoveredPostNumbers" | "unresolvedPostNumbers") =>
    (result.postChecks ?? []).reduce((total, page) => total + page[key].length, 0);
  return { postPageCount: postPages.length, postPages: postPages.slice(0, 100),
    observedPostCount: count("observedPostNumbers"), representedPostCount: count("representedPostNumbers"),
    recoveredPostCount: count("recoveredPostNumbers"), unresolvedPostCount: count("unresolvedPostNumbers"),
    warningCount: result.warnings.filter(warning => warning.severity === "warning").length,
    incompletePageCount: incomplete.length, incompletePages: incomplete.slice(0, 100),
    quantityPageCount: quantities.length, quantityPages: quantities.slice(0, 100) };
}
