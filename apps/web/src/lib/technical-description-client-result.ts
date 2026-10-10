import type { TechnicalDescriptionExtractionResult } from "@/modules/technical-description-extractor";

export function clientTechnicalDescriptionResult(
  result: TechnicalDescriptionExtractionResult,
  options: { summaryOnly?: boolean } = {}
) {
  return {
    document: result.document,
    project: result.project,
    pageChecks: options.summaryOnly ? undefined : result.pageChecks,
    materialLines: (options.summaryOnly ? [] : result.materialLines).map((line) => {
      const clientLine = { ...line };
      delete clientLine.technicalSpecification;
      return clientLine;
    }),
    standards: result.standards,
    ruleHints: options.summaryOnly ? [] : result.ruleHints,
    warnings: options.summaryOnly ? [] : result.warnings
  };
}
