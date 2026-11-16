import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDemoMaterialListCsv,
  DEMO_DATA_DISCLAIMER,
  isDemoData
} from "./demo-data";

test("uses the required exact demo warning", () => {
  assert.equal(
    DEMO_DATA_DISCLAIMER,
    "Demo data – ej verifierad för projektering, installation eller inköp."
  );
});

test("recognizes demo provenance without relying on product names", () => {
  assert.equal(isDemoData({ demo_data_set_id: "dataset-id" }), true);
  assert.equal(isDemoData({ data_mode: "demo" }), true);
  assert.equal(isDemoData({ quality_status: "demo_unverified" }), true);
  assert.equal(isDemoData({ quality_status: "verified" }), false);
  assert.equal(isDemoData(undefined), false);
});

test("demo material CSV always contains the exact warning and neutralizes formulas", () => {
  const csv = buildDemoMaterialListCsv([{
    line: 1,
    category: "Sprinkler",
    product: "=unsafe formula",
    supplier: "Demo supplier",
    quantity: 2,
    unit: "pcs",
    notes: "Fictional"
  }]);
  assert.match(csv, new RegExp(DEMO_DATA_DISCLAIMER));
  assert.match(csv, /'=unsafe formula/);
});
