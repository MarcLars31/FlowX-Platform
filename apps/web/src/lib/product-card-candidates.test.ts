import assert from "node:assert/strict";
import test from "node:test";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { filterAhlsellCandidatesByNrf, groupAhlsellCandidatesForDisplay, normalizeNrfNumber, topAhlsellCandidates } from "./product-card-candidates";
import { validateAhlsellProductLabelItems } from "./ahlsell-product-labels";
import { ahlsellCandidateMatchState } from "./ahlsell-candidate-ranking";
import { candidateSelectionReview, productSelectionReviewNotes, readProductSelectionReview } from "./product-selection-review";
import { technicalConflictWarnings } from "./ahlsell-technical-conflicts";
import { bulkProductApprovalSelection } from "./bulk-product-approval";

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

test("missing technical data is review even when a sparse candidate scores unlikely", () => {
  const incomplete = { ...candidates[0], recommendation: "unlikely" as const, matchWarnings: [
    "K-faktorn saknas i produktinformationen; PDF kräver K80.",
    "Produktens tillåtna arbetstryck behöver verifieras mot PDF-kravet 12 bar.",
    "Utlösningstemperaturen stämmer inte med specifikationen. Databasvärdet saknas."
  ] };
  assert.equal(ahlsellCandidateMatchState(incomplete), "review");
  assert.deepEqual(technicalConflictWarnings(incomplete), []);
  const group = groupAhlsellCandidatesForDisplay([incomplete]);
  assert.deepEqual(group.review, [incomplete]);
  assert.equal(group.rejected.length, 0);
  assert.equal(group.matching.length, 0);
});

test("all rejected candidates remain accessible and requirement review never hides a real conflict", () => {
  const rejected = Array.from({ length: 8 }, (_, index) => ({ ...candidates[0], articleNumber: String(index), matchWarnings: [
    "Fel K-faktor: PDF kräver K80, träffen anger K115.",
    "Produktens tillåtna arbetstryck behöver verifieras mot PDF-kravet 12 bar."
  ] }));
  const group = groupAhlsellCandidatesForDisplay(rejected, false);
  assert.equal(group.rejected.length, 8);
  assert.equal(group.review.length, 0);
  assert.equal(group.matching.length, 0);
  assert.equal(technicalConflictWarnings(rejected[0]).length, 1);
});

test("explicit wet/dry, mounting and finish conflicts stay red", () => {
  for (const warning of [
    "Produkten är endast dokumenterad för torranläggning, men PDF-kravet anger våtanläggning.",
    "PDF-kravet anger infällt montage, men produktens montageutförande stämmer inte.",
    "Färg eller ytfinish stämmer inte med PDF-kravet.",
    "För lågt arbetstryck: PDF kräver 12 bar, produkten är dokumenterad för 10 bar."
  ]) assert.equal(ahlsellCandidateMatchState({ ...candidates[0], matchWarnings: [warning] }), "mismatch", warning);
});

test("manual deviation and missing-data labels round-trip through the atomic approval notes", () => {
  const review = candidateSelectionReview({ ...candidates[0], matchWarnings: ["Fel K-faktor: PDF kräver K80, träffen anger K115."] });
  const saved = productSelectionReviewNotes(review, "Kundens kommentar behålls.");
  assert.deepEqual(readProductSelectionReview(saved), review);
  assert.equal(productSelectionReviewNotes(review, saved), saved);
  assert.equal(productSelectionReviewNotes(null, saved), "Kundens kommentar behålls.");
  const incomplete = candidateSelectionReview();
  assert.equal(readProductSelectionReview(productSelectionReviewNotes(incomplete))?.status, "review");
  assert.equal(candidateSelectionReview({ ...candidates[0], exactMatch: true, matchWarnings: [] }), null);
});

test("a saved deviating product cannot become a bulk-approved memory", () => {
  const notes = productSelectionReviewNotes({ status: "mismatch", warnings: ["Fel K-faktor: PDF kräver K115, träffen anger K80."] });
  const selection = bulkProductApprovalSelection({
    requirement: { id: "test", category: "unknown", mapping_fingerprint: "same", value_text: "Särskild produkt" }, handled: false,
    memories: [{ requirement_fingerprint: "same", product_name: "V2762", product_number: "9257392", notes }]
  });
  assert.equal(selection, null);
});
