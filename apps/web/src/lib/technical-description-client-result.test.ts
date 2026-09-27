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

  const largeResult = { ...result,
    materialLines: Array.from({ length: 3560 }, () => ({ ...result.materialLines[0], sourceText: "krav ".repeat(1000) })),
    warnings: Array.from({ length: 3560 }, (_, index) => ({ id: `warning-${index}`, code: "unknown", message: "Needs review", severity: "warning" as const }))
  };
  const summary = clientTechnicalDescriptionResult(largeResult, { summaryOnly: true });
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < 10_000);
  assert.equal(summary.document.pageCount, 1);
  assert.equal(summary.project.name, "Test");
  assert.equal(summary.materialLines.length, 0);
  assert.equal(largeResult.materialLines.length, 3560);
  assert.equal(largeResult.materialLines[0].sourceText.length, 5000);
});
