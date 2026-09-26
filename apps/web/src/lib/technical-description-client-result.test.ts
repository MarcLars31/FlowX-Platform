import assert from "node:assert/strict";
import test from "node:test";
import { clientTechnicalDescriptionResult } from "./technical-description-client-result";
import type { TechnicalDescriptionExtractionResult } from "@/modules/technical-description-extractor";

test("keeps the saved extraction result compact in the HTTP response", () => {
  const result: TechnicalDescriptionExtractionResult = {
    document: {
      fileName: "underlag.pdf",
      pageCount: 1,
      extractionMethod: "text",
      extractedAt: "2026-08-19T00:00:00.000Z"
    },
    project: { name: "Test", confidence: 0.98 },
    materialLines: [{
      id: "line-1",
      postNumber: "33.335.1",
      category: "sprinkler_head",
      description: "Sprinkler",
      operation: "install",
      quantity: 20,
      unit: "st",
      attributes: { "k-faktor": "80" },
      standardRefs: ["NS-EN-12845"],
      technicalSpecification: "En mycket lång teknisk originaltext",
      sourcePage: 1,
      sourceText: "33.335.1 Sprinkler Antall stk 20",
      confidence: 0.98,
      reviewFlags: []
    }],
    standards: ["NS-EN-12845"],
    ruleHints: [],
    pages: [{
      pageNumber: 1,
      text: "Hela PDF-sidans text ska bara finnas i databasen.",
      method: "text",
      confidence: 0.98
    }],
    warnings: []
  };

  const clientResult = clientTechnicalDescriptionResult(result);
  assert.equal("pages" in clientResult, false);
  assert.equal(
    "technicalSpecification" in clientResult.materialLines[0],
    false
  );
  assert.equal(clientResult.materialLines[0].postNumber, "33.335.1");
});
