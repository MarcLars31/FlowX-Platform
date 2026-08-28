import assert from "node:assert/strict";
import test from "node:test";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { filterAhlsellCandidatesByNrf, normalizeNrfNumber, topAhlsellCandidates } from "./product-card-candidates";

const candidates: AhlsellPublicCandidate[] = [
  candidate("9254042", "Sprinklerhuvud V2703"),
  candidate("9254043", "Sprinklerhuvud V2704"),
  candidate("9254464", "Sprinklerhuvud V2707")
];

test("ett tomt NRF-filter visar alla Ahlsellprodukter", () => {
  assert.deepEqual(filterAhlsellCandidatesByNrf(candidates, "  "), candidates);
});

test("NRF-filter matchar både formaterade, partiella och fullständiga nummer", () => {
  assert.equal(normalizeNrfNumber("NRF 925-4042"), "9254042");
  assert.deepEqual(
    filterAhlsellCandidatesByNrf(candidates, "92540").map((item) => item.articleNumber),
    ["9254042", "9254043"]
  );
  assert.deepEqual(
    filterAhlsellCandidatesByNrf(candidates, "925 4042").map((item) => item.articleNumber),
    ["9254042"]
  );
});

test("ett okänt NRF-nummer ger en tom kandidatlista", () => {
  assert.deepEqual(filterAhlsellCandidatesByNrf(candidates, "1111111"), []);
});

test("visar bara de tre högst rankade Ahlsellprodukterna", () => {
  const rankedCandidates = [
    ...candidates,
    candidate("9254467", "Sprinklerhuvud V2727")
  ];

  assert.deepEqual(
    topAhlsellCandidates(rankedCandidates).map((item) => item.articleNumber),
    ["9254042", "9254043", "9254464"]
  );
  assert.equal(rankedCandidates.length, 4);
});

function candidate(articleNumber: string, productName: string): AhlsellPublicCandidate {
  return {
    articleNumber,
    productName,
    manufacturer: "Victaulic",
    productUrl: `https://example.test/${articleNumber}`,
    specifications: [],
    source: "catalog_search"
  };
}
