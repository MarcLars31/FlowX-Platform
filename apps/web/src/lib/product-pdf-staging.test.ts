import assert from "node:assert/strict";
import test from "node:test";
import { prepareProductPdfForStaging } from "./product-pdf-staging";

test("maps the existing extractor schema into staging candidates", () => {
  const staged = prepareProductPdfForStaging({
    products: [{
      sin: "V2709",
      productName: "Victaulic FireLock Sprinkler",
      responseType: "Standard Response",
      kFactor: [{ value: 81 }],
      partNumbers: [],
      specifications: { nominalSizeDN: "DN15" },
      physicalCharacteristics: { frame: "Brass" },
      fieldSources: {
        kFactor: {
          pageNumber: 3,
          confidence: 0.99,
          extractionMethod: "table",
          sourceExcerpt: "SIN V2709 | K 8.1",
          sourceTableRow: { SIN: "V2709", K: "8.1" }
        }
      }
    }],
    accessories: [],
    documentInfo: {
      manufacturer: "Victaulic",
      documentNumber: "41.51",
      revisionDate: "2024-01-01"
    }
  });

  assert.equal(staged.products.length, 1);
  assert.equal(staged.products[0].manufacturer, "Victaulic");
  assert.equal(staged.products[0].product_no, "V2709");
  assert.equal(staged.products[0].confidence, 0.95);
  assert.deepEqual(staged.products[0].fields.k_factor.normalized_value, [{ value: 81 }]);
  assert.equal(staged.products[0].fields.k_factor.page_number, 3);
  assert.equal(staged.products[0].fields.k_factor.confidence, 0.99);
  assert.deepEqual(staged.products[0].fields.k_factor.source_table_row, {
    SIN: "V2709",
    K: "8.1"
  });
  assert.equal(staged.products[0].fields.nominal_size_dn.normalized_value, "DN15");
  assert.equal(staged.products[0].fields.physical_frame.normalized_value, "Brass");
});

test("creates one variant candidate for every extracted part number", () => {
  const staged = prepareProductPdfForStaging({
    products: [{
      sin: "MODEL-1",
      productName: "Sprinkler",
      variantName: "Pendent",
      partNumbers: ["10001", "10002"]
    }],
    accessories: [{ name: "Guard", partNumber: "G-1", compatibleSins: ["MODEL-1"] }],
    documentInfo: { manufacturer: "Example", documentNumber: "1.01" }
  });

  assert.deepEqual(
    staged.products.map((product) => product.product_no),
    ["MODEL-1", "MODEL-1", "G-1"]
  );
  assert.deepEqual(
    staged.products.map((product) => product.sku),
    ["10001", "10002", undefined]
  );
  assert.equal(staged.products[1].variant_name, "Pendent · 10002");
  assert.deepEqual(staged.products[2].fields.compatible_sins.normalized_value, ["MODEL-1"]);
});

test("does not give synthetic coupling identifiers automatic-create confidence", () => {
  const staged = prepareProductPdfForStaging({
    products: [
      { sin: "W07-12", productName: "AGS coupling", productType: "Coupling" },
      { sin: "V2703", productName: "Sprinkler" }
    ],
    accessories: [],
    documentInfo: { manufacturer: "Victaulic" }
  });

  assert.equal(staged.products[0]?.confidence, 0.88);
  assert.equal(staged.products[0]?.identifier_observed_in_source, false);
  assert.equal(staged.products[1]?.confidence, 0.95);
  assert.equal(staged.products[1]?.identifier_observed_in_source, true);
});
