import assert from "node:assert/strict";
import test from "node:test";
import { enrichProjectRequirements } from "./project-requirement-enrichment";
import {
  postNumberFromSource,
  projectRequirementDetails
} from "./project-requirement-details";

test("reads a split NS 3420 post number from an existing source excerpt", () => {
  assert.equal(
    postNumberFromSource(
      "1403.33.332.\n1.12\nRillerør Bend DN40\nstk 43 0,00 0,00"
    ),
    "1403.33.332.1.12"
  );
});

test("returns every stored specification without the former eight-item limit", () => {
  const attributes = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [`spec_${index + 1}`, `värde ${index + 1}`])
  );
  const details = projectRequirementDetails({
    value_json: { postNumber: "1403.33.332.23.1", attributes },
    source_page: 32,
    source_excerpt: "original"
  });

  assert.equal(details.postNumber, "1403.33.332.23.1");
  assert.equal(details.attributes.length, 12);
  assert.equal(details.sourcePage, 32);
});

test("enriches an existing requirement with its inherited main-post specifications", () => {
  const documentId = "00000000-0000-4000-8000-000000000001";
  const [requirement] = enrichProjectRequirements(
    [{
      id: "requirement-1",
      requirement_key: "pipe",
      value_text: "Rillede rør for sprinkleranl. Pulverlakkert DN100",
      value_json: {
        quantity: 29.16,
        unit: "m",
        attributes: { dimension: "DN100" }
      },
      source_page: 10,
      source_excerpt:
        "1403.33.332.\n1.1\nRillede rør for sprinkleranl. Pulverlakkert DN100\nm 29,16 0,00 0,00",
      source_technical_description_document_id: documentId
    }],
    [{
      id: documentId,
      file_name: "teknisk-beskrivning.pdf",
      source_pages: [
        {
          pageNumber: 9,
          method: "text",
          confidence: 0.98,
          text: [
            "1403.33.332.",
            "1",
            "UB1.31114921934A",
            "INNENDØRS RØRLEDNING – BRANNSLOKKING – KOMPLETT",
            "Materiale: Stål – malingsbehandlet",
            "Trykk: 12 bar",
            "Dimensjon: iht. underposter",
            "Andre krav:",
            "Sum denne side:"
          ].join("\n")
        },
        {
          pageNumber: 10,
          method: "text",
          confidence: 0.98,
          text: [
            "1403.33.332.",
            "1.1",
            "Rillede rør for sprinkleranl. Pulverlakkert DN100",
            "m 29,16 0,00 0,00"
          ].join("\n")
        }
      ]
    }]
  );

  const value = requirement.value_json as Record<string, unknown>;
  const attributes = value.attributes as Record<string, unknown>;
  assert.equal(value.postNumber, "1403.33.332.1.1");
  assert.equal(value.parentPostNumber, "1403.33.332.1");
  assert.equal(value.nsCode, "UB1.31114921934A");
  assert.equal(attributes.materiale, "Stål – malingsbehandlet");
  assert.equal(attributes.trykk, "12 bar");
  assert.equal(attributes.dimensjon, "DN100");
});
