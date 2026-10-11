import { extractionQualitySummary } from "./technical-description-quality";
import type { TechnicalDescriptionExtractionResult } from "@/modules/technical-description-extractor";

export function clientTechnicalDescriptionResult(
  result: TechnicalDescriptionExtractionResult,
  options: { summaryOnly?: boolean } = {}
) {
  return {
    document: result.document,
    warningSummary: extractionQualitySummary(result),
    project: result.project,
    pageChecks: options.summaryOnly ? undefined : result.pageChecks,
    materialLines: (options.summaryOnly ? [] : result.materialLines).map((line) => {
      const clientLine = { ...line };
      delete clientLine.technicalSpecification;
      return clientLine;
    }),
    standards: result.standards,
    ruleHints: options.summaryOnly ? [] : result.ruleHints,
    warnings: options.summaryOnly ? [...result.warnings]
      .sort((a, b) => Number(b.code === "PAGE_EXTRACTION_INCOMPLETE") - Number(a.code === "PAGE_EXTRACTION_INCOMPLETE"))
      .slice(0, 10).map(({ id, code, message, sourcePage, severity }) => ({ id, code, message: message.slice(0, 400), sourcePage, severity })) : result.warnings
  };
}
