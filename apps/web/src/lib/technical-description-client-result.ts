import type { TechnicalDescriptionExtractionResult } from "@/modules/technical-description-extractor";

export function clientTechnicalDescriptionResult(
  result: TechnicalDescriptionExtractionResult
) {
  return {
    document: result.document,
    project: result.project,
    materialLines: result.materialLines.map((line) => {
      const clientLine = { ...line };
      delete clientLine.technicalSpecification;
      return clientLine;
    }),
    standards: result.standards,
    ruleHints: result.ruleHints,
    warnings: result.warnings
  };
}
