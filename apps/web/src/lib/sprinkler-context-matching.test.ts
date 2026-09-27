import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { isExactAhlsellCandidate, isMatchingAhlsellCandidate, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { suggestedAccessories } from "./ahlsell-accessory-suggestions";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";
import { classifyAhlsellCatalogCandidates } from "./ahlsell-match-groups";

const standardAttributes = {
  sprinkleranlegg: "Våtanlegg", "type sprinkler": "Spraysprinkler", plassering: "Hengende",
  "følsomhetsgrad": "Kvikk respons", "utløsningstemperatur": "68 °C", "k-faktor": "80",
  "gjengedimensjon (DN)": "15", overflatebehandling: "Messing", trykk: "12 bar"
};

test("three overlapping accessory warnings become one conditional notice while technical conflicts remain", () => {
  const requirement = { category: "sprinkler_head", value_text: "SPRINKLER", value_json: { attributes: {
    ...standardAttributes, "dekkskive/pyntering (ved innfelling)": "Dobbel rosett", beskyttelse: "Nei"
  } } };
  const guide = buildAhlsellRequirementGuide(requirement);
  assert.deepEqual(guide.accessoryRequirements, ["Dubbel rosett (vid infällt montage)"]);
  assert.deepEqual(guide.interpretationWarnings, []);
  const candidates = findMldlOnlyCandidates(requirement);
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(candidate => candidate.requiresAccessoryReview && !isMatchingAhlsellCandidate(candidate)));
  assert.ok(candidates.every(candidate => !candidate.matchWarnings?.some(warning => /kompatibilitetskontrolleras|Kravet gäller vid infällt montage|Specifikationen kräver ett tillbehör/.test(warning))));
  const merged = mergeAhlsellCandidates(candidates, [{ ...candidates[0], source: "catalog_search", exactMatch: true, recommendation: "recommended", matchWarnings: [], requiresAccessoryReview: false }]);
  assert.equal(merged.find(candidate => candidate.articleNumber === candidates[0].articleNumber)?.requiresAccessoryReview, true);
  assert.notEqual(classifyAhlsellCatalogCandidates(merged), "safe");
  const [wrong] = rankAhlsellCandidates(requirement, [{
    ...product, articleNumber: "test-wrong", productName: "Sprinkler K115 DN15 QR 93C pendent mässing",
    specifications: ["K115", "DN15", "QR", "93C", "pendent", "standard coverage", "16 bar", "Messing"]
  }]);
  assert.ok(wrong.matchWarnings?.some(warning => /Fel K-faktor/.test(warning)));
  assert.ok(wrong.matchWarnings?.some(warning => /Fel temperatur/.test(warning)));
});

test("Sprinkler2 keeps the verified head green while an alternative still lacks pressure evidence", () => {
  const requirement = { category: "sprinkler_head", value_text: "SPRINKLER", value_json: { attributes: {
    ...standardAttributes, plassering: "Hengende synlig i tak og over systemhimling",
    "dekkskive/pyntering (ved innfelling)": "|.R.", beskyttelse: "Nei"
  } } };
  assert.deepEqual(buildAhlsellRequirementGuide(requirement).accessoryRequirements, []);
  const candidates = rankAhlsellCandidates(requirement, findMldlOnlyCandidates(requirement));
  const matches = candidates.filter(isMatchingAhlsellCandidate);
  assert.deepEqual(matches.map(candidate => candidate.articleNumber), ["9257392"]);
  assert.ok(candidates.find(candidate => candidate.articleNumber === "9254064")?.matchWarnings?.some(warning => /arbetstryck/.test(warning)));
  assert.ok(matches.every(candidate => !isExactAhlsellCandidate(candidate)));
  assert.equal(classifyAhlsellCatalogCandidates(candidates), "safe");
});

// Regression from the customer's annotated screenshot. These are source fields,
// not an instruction to approve this sprinkler or change its construction type.
const sourceText = `0.33.332.2 UE2.11112912A
SPRINKLER
Antall stk 188
Sprinkleranlegg: Våtanlegg
Type sprinkler: Spraysprinkler
Plassering: Stående og hengende
Følsomhetsgrad: Kvikk respons
Utløsningstemperatur: 68 °C
Lokalisering: arealer uten himling, eller over himling
K-faktor: 80
Trykk: min 12 bar
Gjengedimensjon (DN): 15
Overflatebehandling: Valgfritt
Dekkskive/pyntering (ved innfelling): Ja
Beskyttelse: Valgfritt
Type: SSP/SSU`;

const product = {
  articleNumber: "9254111", productName: "Sprinklerhoder Modell V2726 QR Victaulic Firelock - Konvensjonell opp/ned",
  manufacturer: "Victaulic", productUrl: "https://www.ahlsell.no/products/sprinkler/9254111/",
  specifications: ["Modell: V2726", "K80", "DN15", "68°C", "Quick response", "SSP/SSU", "Messing"], source: "catalog_search" as const
};

test("preserves the PDF condition and applies it consistently through search, ranking and accessories", () => {
  const extracted = extractTechnicalDescriptionFromPages([{ pageNumber: 17, text: sourceText, method: "text", confidence: 0.98 }]);
  const line = extracted.materialLines.find((item) => item.postNumber === "0.33.332.2");
  assert.ok(line);
  assert.equal(line.quantity, 188);
  assert.equal(line.sourcePage, 17);
  assert.ok(Object.entries(line.attributes).some(([label, value]) => /ved innfelling/i.test(label) && value === "Ja"));
  const requirement = { category: "sprinkler_head", value_text: "SPRINKLER", value_json: { attributes: line.attributes, sourceText: line.sourceText }, source_excerpt: line.sourceText };
  const guide = buildAhlsellRequirementGuide(requirement);
  assert.ok(!guide.criteria.includes("Recessed"));
  assert.match(guide.interpretationNotes?.join(" ") ?? "", /Ingen täckbricka krävs av detta fält/);
  const [ranked] = rankAhlsellCandidates(requirement, [product]);
  assert.ok(!ranked.matchWarnings?.some((message) => /infällt|täckbricka|tillbehör/i.test(message)), ranked.matchWarnings?.join("\n"));
  assert.equal(ranked.exactMatch, false);
  assert.ok(ranked.matchWarnings?.some((message) => /monteringsriktningar/i.test(message)));
  assert.deepEqual(suggestedAccessories(requirement, { ...product, articleNumber: "9257392" }), []);
});

test("real recessed mounting retains the cover requirement throughout the same pipeline", () => {
  const requirement = { category: "sprinkler_head", value_text: "SPRINKLER", value_json: { attributes: {
    plassering: "Innfelt synlig i tak", lokalisering: "Rom med himling",
    "dekkskive/pyntering (ved innfelling)": "Ja", beskyttelse: "Valgfritt"
  } } };
  assert.ok(buildAhlsellRequirementGuide(requirement).criteria.includes("Recessed"));
  const [ranked] = rankAhlsellCandidates(requirement, [product]);
  assert.ok(ranked.matchWarnings?.some((message) => /infällt/i.test(message)));
  assert.equal(ranked.requiresAccessoryReview, true);
  assert.deepEqual(buildAhlsellRequirementGuide(requirement).accessoryRequirements, ["Täckbricka/rosett (vid infällt montage)"]);
  const accessories = suggestedAccessories(requirement, { ...product, articleNumber: "9257392" });
  assert.ok(accessories.some((entry) => /dekkskiv/i.test(entry.productName) && entry.required));
  assert.ok(!accessories.some((entry) => /gitter/i.test(entry.productName)));
});

test("required protection remains when the conditional cover is not applicable", () => {
  const requirement = { category: "sprinkler_head", value_text: "SPRINKLER", value_json: { attributes: {
    plassering: "Hengende", lokalisering: "Over himling", "dekkskive (ved innfelling)": "Ja", beskyttelse: "Gitter"
  } } };
  const accessories = suggestedAccessories(requirement, { ...product, articleNumber: "9257392" });
  assert.ok(accessories.some((entry) => /gitter/i.test(entry.productName) && entry.required));
  assert.ok(!accessories.some((entry) => /dekkskiv/i.test(entry.productName)));
});
