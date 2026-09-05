import assert from "node:assert/strict";
import test from "node:test";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import {
  MAX_RECORDED_PRODUCT_CANDIDATES,
  productLearningCandidateSnapshots
} from "./product-learning-feedback";

test("records the three displayed candidates in ranking order", () => {
  const snapshots = productLearningCandidateSnapshots([
    candidate("1", "Första"),
    candidate("2", "Andra"),
    candidate("3", "Tredje"),
    candidate("4", "Fjärde")
  ]);

  assert.equal(MAX_RECORDED_PRODUCT_CANDIDATES, 3);
  assert.deepEqual(snapshots.map((item) => [item.rank, item.articleNumber]), [
    [1, "1"],
    [2, "2"],
    [3, "3"]
  ]);
});

test("normalizes feedback payloads without mutating catalog candidates", () => {
  const source = candidate(" 9254043 ", "  Sprinklerhuvud V2704  ");
  source.description = `  ${"x".repeat(1100)}  `;
  source.matchScore = 150;
  source.matchReasons = [" Rätt responstid ", ""];
  source.matchWarnings = [" Kontroll krävs "];
  const before = structuredClone(source);

  const [snapshot] = productLearningCandidateSnapshots([source]);

  assert.equal(snapshot.articleNumber, "9254043");
  assert.equal(snapshot.productName, "Sprinklerhuvud V2704");
  assert.equal(snapshot.description?.length, 1000);
  assert.equal(snapshot.matchScore, 100);
  assert.deepEqual(snapshot.matchReasons, ["Rätt responstid"]);
  assert.deepEqual(snapshot.matchWarnings, ["Kontroll krävs"]);
  assert.equal(snapshot.matchState, "mismatch");
  assert.equal(snapshot.familyCode, null);
  assert.deepEqual(source, before);
});

function candidate(articleNumber: string, productName: string): AhlsellPublicCandidate {
  return {
    articleNumber,
    productName,
    manufacturer: "Victaulic",
    productUrl: `https://example.test/${articleNumber}`,
    description: "Teknisk beskrivning",
    specifications: ["K80", "68 °C"],
    source: "catalog_search",
    recommendation: "recommended",
    matchScore: 90,
    matchReasons: [],
    matchWarnings: [],
    exactMatch: false
  };
}
