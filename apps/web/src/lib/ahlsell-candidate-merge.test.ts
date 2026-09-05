import assert from "node:assert/strict";
import test from "node:test";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

test("keeps the verified technical assessment and enriches it with live Ahlsell data", () => {
  const [merged] = mergeAhlsellCandidates([
    candidate("9257423", "V2762", "verified_database", true)
  ], [{
    ...candidate("9257423", "Sprinklerhoder Modell V2762 Victaulic FireLock", "catalog_search", false),
    imageUrl: "https://example.test/image.jpg",
    description: "Aktuell Ahlsell-beskrivning",
    matchWarnings: ["Live-rankerns osäkra varning"]
  }]);

  assert.equal(merged.source, "verified_database");
  assert.equal(merged.exactMatch, true);
  assert.equal(merged.matchWarnings?.length, 0);
  assert.equal(merged.imageUrl, "https://example.test/image.jpg");
  assert.equal(merged.description, "Aktuell Ahlsell-beskrivning");
  assert.match(merged.productName, /Sprinklerhoder/);
});

test("returns one ranked candidate per normalized article number", () => {
  const merged = mergeAhlsellCandidates(
    [candidate("92 574 23", "Verifierad", "verified_database", false)],
    [candidate("9257423", "Live", "catalog_search", false), candidate("1", "Annan", "catalog_search", false)]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged.filter((item) => item.articleNumber.replace(/\D/g, "") === "9257423").length, 1);
});

function candidate(
  articleNumber: string,
  productName: string,
  source: AhlsellPublicCandidate["source"],
  exactMatch: boolean
): AhlsellPublicCandidate {
  return {
    articleNumber,
    productName,
    manufacturer: "Victaulic",
    productUrl: `https://example.test/${articleNumber}`,
    specifications: ["K80", "DN15"],
    source,
    exactMatch,
    matchScore: exactMatch ? 100 : 80,
    matchReasons: ["Tekniskt kontrollerad"],
    matchWarnings: [],
    recommendation: exactMatch ? "recommended" : "possible"
  };
}
