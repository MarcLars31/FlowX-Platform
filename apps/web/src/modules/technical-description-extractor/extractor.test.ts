import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "./extractor";
import type { TechnicalDescriptionPage } from "./types";

const fixturePages: TechnicalDescriptionPage[] = [
  {
    pageNumber: 1,
    method: "ocr",
    confidence: 0.92,
    text: [
      "Prosjekt: C.2.3 Teknisk beskrivelse - Oppgradering SOP - Røranlegg Side 33-6",
      "Kapittel: 33 Brannslokking",
      "UE2.11111112A",
      "SPRINKLER",
      "Antall stk 20",
      "Sprinkleranlegg: Våtanlegg",
      "Type sprinkler: Konvensjonell sprinkler",
      "Plassering: Stående",
      "K-faktor: 80",
      "Trykk: Min PN 16",
      "Gjengedimensjon (DN): DN 15",
      "Hoder som er til overs benyttes som reservehoder.",
      "Sprinklersystemet skal utføres i overensstemmelse med NS-EN 12845."
    ].join("\n")
  },
  {
    pageNumber: 2,
    method: "ocr",
    confidence: 0.92,
    text: [
      "33.335.2 | UE2.11111212A",
      "SPRINKLER",
      "Antall stk 20",
      "Sprinkleranlegg: Våtanlegg",
      "Plassering: Hengende i tak",
      "33.335.3 | UE2.11111112A",
      "SPRINKLER",
      "Sprinkleranlegg: Våtanlegg",
      "Plassering: Stående",
      "Demontering av eksisterende hoder"
    ].join("\n")
  }
];

test("extracts technical-description material lines and rule hints", () => {
  const result = extractTechnicalDescriptionFromPages(fixturePages, {
    fileName: "Sprinkler.pdf"
  });

  assert.equal(result.document.extractionMethod, "ocr");
  assert.equal(result.project.projectNumber, "C.2.3");
  assert.equal(result.project.chapter, "33 Brannslokking");
  assert.deepEqual(result.standards, ["NS-EN-12845"]);
  assert.equal(result.materialLines.length, 3);
  assert.deepEqual(
    result.materialLines.map((line) => ({
      postNumber: line.postNumber,
      quantity: line.quantity,
      operation: line.operation
    })),
    [
      { postNumber: "33.335.1", quantity: 20, operation: "install" },
      { postNumber: "33.335.2", quantity: 20, operation: "install" },
      { postNumber: "33.335.3", quantity: undefined, operation: "remove" }
    ]
  );
  assert.equal(result.materialLines[0].category, "sprinkler_head");
  assert.equal(result.materialLines[0].attributes["k-faktor"], "80");
  assert.equal(result.ruleHints[0]?.key, "sprinkler_head_reserve");
  assert.equal(
    result.warnings.some((warning) => warning.code === "INFERRED_POST_NUMBER"),
    true
  );
});
