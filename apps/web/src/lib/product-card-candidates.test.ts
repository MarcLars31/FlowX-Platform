import assert from "node:assert/strict";
import test from "node:test";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { filterAhlsellCandidatesByNrf, groupAhlsellCandidatesForDisplay, normalizeNrfNumber, topAhlsellCandidates } from "./product-card-candidates";
import { validateAhlsellProductLabelItems } from "./ahlsell-product-labels";

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

test("den utfällbara gruppen behåller alla matchningar och skiljer dem från avvikelser och tillbehörskrav", () => {
  const matching: AhlsellPublicCandidate[] = Array.from({ length: 16 }, (_, index) => ({
    ...candidate(`925${4000 + index}`, `Matchning ${index + 1}`),
    recommendation: "recommended", matchScore: 100, exactMatch: false, requiresProductSelection: true, matchWarnings: []
  }));
  const mismatch = { ...matching[0], articleNumber: "wrong", matchWarnings: ["Fel K-faktor: PDF kräver K80, produkten anger K115."] };
  const accessory = { ...matching[0], articleNumber: "accessory", requiresAccessoryReview: true };
  const group = groupAhlsellCandidatesForDisplay([...matching, mismatch, accessory]);
  assert.equal(group.matching.length, 16);
  assert.deepEqual(group.other, [mismatch, accessory]);
  assert.equal(groupAhlsellCandidatesForDisplay(matching, false).matching.length, 0);
});

test("validerar en begränsad lista med unika produktrader för Ahlselltexter", () => {
  const valid = validateAhlsellProductLabelItems({
    items: [{
      requirementId: "11111111-1111-4111-8111-111111111111",
      articleNumber: "NRF 925 4043"
    }]
  });
  assert.deepEqual(valid, {
    data: [{
      requirementId: "11111111-1111-4111-8111-111111111111",
      articleNumber: "9254043"
    }]
  });

  const duplicate = validateAhlsellProductLabelItems({
    items: [
      { requirementId: "11111111-1111-4111-8111-111111111111", articleNumber: "9254043" },
      { requirementId: "11111111-1111-4111-8111-111111111111", articleNumber: "9254042" }
    ]
  });
  assert.ok("error" in duplicate);
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
