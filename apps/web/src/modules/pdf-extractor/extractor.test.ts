import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractTechnicalSpecificationFromPages,
  normalizeNorwegianNumber
} from "./extractor";
import { samplePdfFileName, samplePdfPages } from "./sample-text";

const result = extractTechnicalSpecificationFromPages(samplePdfPages, {
  fileName: samplePdfFileName
});

const messyResult = extractTechnicalSpecificationFromPages([
  {
    pageNumber: 1,
    text: `
NFPA 13
1403.33.400.1 Rillede rør for sprinkleranl. Pulverlakkert DN150
m 1 234,50
AB12 Klammer DN25 | stk | 42
Fleksibelslange Sprinkleranlegg DN25 386 stk
2 sett Alarmventil DN100
Brakett 30 x 40 mm stk 12
Brannisolering plate m2 45,5
Sum materialer NOK 10 000
`
  }
]);

const traceResult = extractTechnicalSpecificationFromPages([
  {
    pageNumber: 3,
    text: `
1403.33.331.1 INNENDØRS RØRLEDNINGER - BRANNSLOKKING
1403.33.331.1 UB1.31994499934A Rillede rør for sprinkleranl. Pulverlakkert DN100 m 29,16
`
  }
]);

describe("pdf extractor", () => {
  it("detects NFPA sprinkler standards", () => {
    assert.deepEqual(
      result.standards.map((standard) => standard.code),
      ["NFPA 13", "NFPA 14"]
    );
  });

  it("normalizes Norwegian decimal quantities", () => {
    assert.equal(normalizeNorwegianNumber("29,16"), 29.16);

    const dn100 = result.lineItems.find((item) => item.dimension === "DN100");

    assert.equal(dn100?.quantity, 29.16);
    assert.equal(dn100?.unit, "m");
  });

  it("detects DN dimensions and pipe quantities", () => {
    const dimensions = new Set(result.lineItems.map((item) => item.dimension));

    for (const dimension of ["DN25", "DN32", "DN40", "DN50", "DN65", "DN80", "DN100"]) {
      assert.equal(dimensions.has(dimension), true);
    }

    const pipes = result.lineItems.filter((item) => item.category === "pipe");

    assert.equal(pipes.length, 7);
    assert.equal(pipes.every((item) => item.unit === "m"), true);
  });

  it("categorizes sprinkler heads, valves, flow switches and I/O units", () => {
    assert.ok(
      result.lineItems.some(
        (item) =>
          item.category === "sprinkler" &&
          item.description.includes("Standard Spray") &&
          item.quantity === 306
      )
    );
    assert.ok(
      result.lineItems.some(
        (item) =>
          item.category === "valve" &&
          item.description.includes("Stengeventil") &&
          item.quantity === 5
      )
    );
    assert.ok(
      result.lineItems.some(
        (item) => item.category === "sensor" && item.description === "Str\u00f8mningsvakt"
      )
    );
    assert.ok(
      result.lineItems.some(
        (item) =>
          item.category === "control" &&
          item.description === "I/O Enhet Str\u00f8mningsvakt"
      )
    );
  });

  it("keeps source page references and confidence scores on every line item", () => {
    assert.equal(result.lineItems.length, 18);
    assert.equal(
      result.lineItems.every(
        (item) =>
          item.sourcePage > 0 &&
          item.sourceText.length > 0 &&
          Boolean(item.sourceTextBlock) &&
          Boolean(item.sectionTitle) &&
          item.confidence > 0
      ),
      true
    );
  });

  it("defaults extracted material lines to the sprinkler system when page context is missing", () => {
    assert.equal(
      result.lineItems.every((item) => item.system === "Sprinkleranlegg A10"),
      true
    );
  });

  it("extracts wrapped material rows with thousand-separated Norwegian quantities", () => {
    const wrappedPipe = messyResult.lineItems.find(
      (item) => item.postNumber === "1403.33.400.1"
    );

    assert.equal(wrappedPipe?.quantity, 1234.5);
    assert.equal(wrappedPipe?.quantityText, "1 234,50");
    assert.equal(wrappedPipe?.unit, "m");
    assert.equal(wrappedPipe?.dimension, "DN150");
    assert.equal(wrappedPipe?.extractionMethod, "wrapped-line");
  });

  it("extracts table-like and quantity-first material rows", () => {
    const tableRow = messyResult.lineItems.find((item) => item.nsCode === "AB12");
    const quantityFirst = messyResult.lineItems.find((item) =>
      item.description.includes("Alarmventil")
    );

    assert.equal(tableRow?.quantity, 42);
    assert.equal(tableRow?.specificationCode, "AB12");
    assert.equal(tableRow?.unit, "stk");
    assert.equal(tableRow?.extractionMethod, "table-row");
    assert.equal(quantityFirst?.quantity, 2);
    assert.equal(quantityFirst?.unit, "sett");
    assert.equal(quantityFirst?.category, "valve");
  });

  it("keeps measurable unknown material rows and ignores totals", () => {
    const insulation = messyResult.lineItems.find((item) =>
      item.description.includes("Brannisolering")
    );

    assert.equal(insulation?.quantity, 45.5);
    assert.equal(insulation?.unit, "m2");
    assert.equal(
      messyResult.lineItems.some((item) => item.description.includes("Sum materialer")),
      false
    );
  });

  it("stores full technical specification traceability for extracted lines", () => {
    const item = traceResult.lineItems[0];

    assert.equal(item.postNumber, "1403.33.331.1");
    assert.equal(item.specificationCode, "UB1.31994499934A");
    assert.equal(item.nsCode, "UB1.31994499934A");
    assert.equal(item.sectionTitle, "INNENDØRS RØRLEDNINGER - BRANNSLOKKING");
    assert.equal(item.sourcePage, 3);
    assert.equal(
      item.sourceTextBlock?.includes("UB1.31994499934A Rillede rør"),
      true
    );
  });
});
