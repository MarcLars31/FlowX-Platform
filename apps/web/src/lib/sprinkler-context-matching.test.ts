import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { suggestedAccessories } from "./ahlsell-accessory-suggestions";

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
  assert.ok(ranked.matchWarnings?.some((message) => /täckbricka/i.test(message)));
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
