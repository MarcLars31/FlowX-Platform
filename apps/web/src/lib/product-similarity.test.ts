import assert from "node:assert/strict";
import test from "node:test";
import { findSimilarProducts, rankSimilarProducts, similarProductFilter, type SimilarityProduct } from "./product-similarity";

const sprinkler = (overrides: Partial<SimilarityProduct> = {}): SimilarityProduct => ({
  id: "sprsok:1", source: "sprsok", sin: "A1", leverandor: "Tyco", type: "Standard",
  utforelse: "Pendent", k_verdi: "80", rti: "QR", ...overrides
});

test("a different supplier with matching technical properties wins over the same supplier's wrong product", () => {
  const wrong = sprinkler({ id: "flowx:wrong", source: "flowx", product_name: "Manometer", type: "Manometer", k_verdi: null });
  const right = sprinkler({ id: "sprsok:2", sin: "B2", leverandor: "Reliable" });
  const matches = rankSimilarProducts(sprinkler(), [wrong, right]);
  assert.deepEqual(matches.map(item => item.product.id), [right.id]);
  assert.deepEqual(rankSimilarProducts(sprinkler(), [{ ...right, leverandor: "Tyco" }]).map(item => item.score), matches.map(item => item.score));
  assert.doesNotMatch(similarProductFilter(sprinkler())!, /leverandor|Tyco/);
});

test("known conflicts in sprinkler K, response, orientation and application exclude alternatives", () => {
  for (const difference of [{ k_verdi: "800" }, { rti: "SR" }, { utforelse: "Upright" }, { type: "Bolig" }]) {
    assert.equal(rankSimilarProducts(sprinkler(), [sprinkler({ id: 2, ...difference })]).length, 0);
  }
});

test("technical aliases and decimal formatting match without claiming a verified substitute", () => {
  const [match] = rankSimilarProducts(sprinkler(), [sprinkler({ id: 2, utforelse: "Hengende", rti: "Quick Response", k_verdi: "80,0 (5.6)" })]);
  assert.ok(match);
  assert.equal(match.product.similarity.status, "needs_verification");
  assert.ok(match.product.similarity.matched.includes("K-värde"));
  assert.ok(match.product.similarity.missing.includes("Dimension"));
  assert.ok(match.product.similarity.missing.includes("Temperatur"));
  assert.equal(rankSimilarProducts(sprinkler(), [sprinkler({ id: 3, k_verdi: "5.6" })]).length, 0);
});

test("supplier, family and application alone are insufficient evidence", () => {
  assert.equal(rankSimilarProducts(sprinkler(), [sprinkler({ id: 2, k_verdi: null, utforelse: null, rti: null })]).length, 0);
  assert.equal(rankSimilarProducts(sprinkler({ source: "flowx", type: "Unknown" }), [sprinkler({ id: 2 })]).length, 0);
});

test("canonical pipe dimensions and material gate suggestions across suppliers", () => {
  const pipe = sprinkler({ id: "pipe-1", source: "flowx", product_name: "Stålrør", type: "pipe", product_category: "pipe",
    material: "steel", available_sizes: "DN25", connection_type: "grooved", utforelse: "grooved", k_verdi: null, rti: null });
  const candidates = [
    { ...pipe, id: "pipe-2", leverandor: "Other" },
    { ...pipe, id: "pipe-3", available_sizes: "DN50" },
    { ...pipe, id: "pipe-4", material: "copper" },
    { ...pipe, id: "pipe-5", connection_type: "threaded" }
  ];
  assert.deepEqual(rankSimilarProducts(pipe, candidates).map(item => item.product.id), ["pipe-2"]);
});

test("missing placeholders and family-wide dimension lists are never counted as matching evidence", () => {
  const source = sprinkler({ rti: "N/A", utforelse: "unknown", available_sizes: "DN15, DN20" });
  assert.equal(rankSimilarProducts(source, [{ ...source, id: 2 }]).length, 0);
});

test("temperature, working pressure and pressure class remain distinct comparison gates", () => {
  const source = sprinkler({ technical_data: { temperatureC: 68, workingPressureBar: 12, pressureClass: "PN16" } });
  for (const technical_data of [{ temperatureC: 93 }, { workingPressureBar: 10 }, { pressureClass: "PN25" }]) {
    assert.equal(rankSimilarProducts(source, [sprinkler({ id: 2, technical_data })]).length, 0);
  }
  const [match] = rankSimilarProducts(source, [sprinkler({ id: 3, technical_data: { pressureClass: "PN16" } })]);
  assert.ok(match.product.similarity.matched.includes("Tryckklass"));
  assert.ok(match.product.similarity.missing.includes("Arbetstryck"));
});

test("comparison is not limited to the first hundred loosely matching candidates", async () => {
  const candidates = Array.from({ length: 251 }, (_, i) => sprinkler({ id: i + 2, k_verdi: i === 250 ? "80" : "800" }));
  const result = await findSimilarProducts(sprinkler(), async params => candidates.slice(Number(params.offset), Number(params.offset) + Number(params.limit)), 5);
  assert.deepEqual(result.products.map(product => product.id), [252]);
  assert.equal(result.truncated, false);
});

test("bounded candidate retrieval reports incomplete coverage", async () => {
  let calls = 0;
  const result = await findSimilarProducts(sprinkler(), async () => {
    calls++;
    return Array.from({ length: 250 }, (_, i) => sprinkler({ id: calls * 250 + i }));
  }, 5);
  assert.equal(calls, 8);
  assert.equal(result.products.length, 5);
  assert.equal(result.truncated, true);
});
