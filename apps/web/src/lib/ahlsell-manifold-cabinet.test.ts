import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { complementMldlCandidates, findAhlsellHybridCandidates } from "./ahlsell-hybrid-matching";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";
import { isManifoldCabinetProduct } from "./ahlsell-manifold-cabinet";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import type { TechnicalDescriptionPage } from "../modules/technical-description-extractor/types";

const title = "INNENDØRS VANNLEDNING I VARERØR (RØR I RØR) – FORDELINGSSKAP";
const attributes = {
  kapittelpost: "31 Sanitær", lokalisering: "Bad leieligheter plan 1",
  "dimensjon skap": "Iht. antal kurser", "dimensjon tilførsel": "15", "dimensjon utganger": "Valgfritt",
  "antall utganger": "5 Kv og 4 Vv", "stengeventil på hver utgang": "Valgfritt",
  "stengeventil på tilførsel": "Valgfritt", trykk: "PN6",
  "materiale skap": "Valgfritt", "materiale fordeler": "Valgfritt", drenering: "Ja"
};
const req = { category: "valve", value_text: title, value_json: {
  nsCode: "UB1.25A", postNumber: "31.4.5", quantity: 14, unit: "stk", attributes,
  // Existing imports may still contain the old next-chapter continuation.
  sourceText: "Posten gjelder nytt fordelerskap for tappevann. Eksisterende kobberrør tilknyttes skapet. "
    + "FORTSETTELSE SIDE 18\nSprinkleranlegg NS-EN 12845. Flexislanger DN25."
} };
const candidate = (productName: string, articleNumber = "cabinet-test"): AhlsellPublicCandidate => ({
  productName, articleNumber, productUrl: `https://www.ahlsell.no/products/vvs-teknisk/test/${articleNumber}`,
  manufacturer: "Test", specifications: [], source: "public_verified", exactMatch: true
});

test("31.4.5 searches automatically for cabinets despite optional valves and stale categories", () => {
  for (const category of ["valve", "pipe", "unknown", "other"]) {
    const requirement = { ...req, category };
    assert.equal(ahlsellRequirementIntent(requirement), "manifold_cabinet");
    assert.deepEqual(findMldlOnlyCandidates(requirement), []);
    const guide = buildAhlsellRequirementGuide(requirement);
    assert.deepEqual(guide.searchQueries, ["Fordelerskap tappevann", "Fordelingsskap rør i rør", "Fordelerskap"]);
    assert.equal(new URL(guide.searchUrl).hostname, "www.ahlsell.no");
    assert.ok(guide.criteria.includes("Utgångar: 5 Kv og 4 Vv"));
    assert.ok(guide.criteria.includes("Tillförseldimension enligt PDF: 15"));
    assert.ok(guide.criteria.includes("Tryckklass: PN6"));
    assert.ok(guide.criteria.includes("Dränering: Ja"));
    assert.doesNotMatch(guide.criteria.join(" "), /DN\d|sprinkler|12845/i);
  }
  assert.equal(ahlsellRequirementIntent({ value_text: "Kuleventil for fordelerskap DN15" }), "ball_valve");
  assert.equal(ahlsellRequirementIntent({ value_text: "Sprinklerskap med reservesprinklerhoder" }), "sprinkler_cabinet");
});

const validCabinets = [
  "Fordelerskap 12 uttak m/dør/ramme hvit alu Sanipex",
  "550x500x108mm fordelerskap B FS u/dør/ramme Uponor",
  "Fordelerskap m/dør, ramme og materialpakke alu. Sanipex",
  "LK Fördelarskåp UNI", "Fordelerskap for tappevann og gulvvarme"
];
const wrongProducts = [
  "Spjeldventil V124 114.3mm", "Kuleventil for fordelerskap", "Fordeler med 4 uttak Sanipex",
  "Dør og ramme for fordelerskap", "Ramme/luke UNI 550 tak LK Pex",
  "Skapmuffe til fordelerskap Uponor", "Fordelerskap dør 550", "Fordelerskap kuleventil",
  "Sprinklerskap", "Elektrisk fordelingsskap", "Fordelerskap gulvvarme", "Holder til fordelerskap"
];

test("keeps cabinets with included doors while excluding valves, bare manifolds and cabinet accessories", () => {
  for (const name of validCabinets) assert.equal(isManifoldCabinetProduct(name), true, name);
  for (const name of wrongProducts) assert.equal(isManifoldCabinetProduct(name), false, name);
  for (const result of rankAhlsellCandidates(req, wrongProducts.map(name => candidate(name)))) {
    assert.equal(ahlsellCandidateMatchState(result), "mismatch", result.productName);
    assert.equal(result.exactMatch, false);
  }
  assert.deepEqual(complementMldlCandidates(req, wrongProducts.map(name => candidate(name)),
    wrongProducts.map(name => candidate(name))), []);
});

test("a cabinet family never verifies all nine outlets, drainage and installation requirements", () => {
  for (const result of rankAhlsellCandidates(req, validCabinets.map(name => candidate(name)))) {
    assert.equal(ahlsellCandidateMatchState(result), "review", result.productName);
    assert.equal(result.exactMatch, false);
    assert.match(result.matchWarnings!.join(" "), /antal kall- och varmvattenutgångar/);
    assert.doesNotMatch(result.matchWarnings!.join(" "), /DN25|sprinkler|12845/i);
  }
});

test("automatically retrieves cabinets from Ahlsell even when MLDL has none", async () => {
  const article = "5113213";
  const queries: string[] = [];
  let detailRead = false;
  const result = await findAhlsellHybridCandidates(req, async input => {
    const url = new URL(String(input));
    if (url.pathname.startsWith("/products/")) {
      detailRead = true;
      return new Response(`<h1 data-test="product-name">Fordelerskap Sanipex</h1><div>${validCabinets[0]}</div><span class="text-card-item-number"><span>${article}</span></span>`, {
        headers: { "Content-Type": "text/html" }
      });
    }
    const query = url.searchParams.get("parameters.SearchPhrase")!;
    queries.push(query);
    return Response.json({ productCount: 2, productCards: [
      { name: validCabinets[0], mostRelevantVariantId: article, firstVariationPageUrl: candidate("", article).productUrl, brand: "Sanipex" },
      { name: wrongProducts[1], mostRelevantVariantId: "wrong-valve", firstVariationPageUrl: candidate("", "wrong-valve").productUrl, brand: "Test" }
    ] });
  });
  assert.ok(queries.includes("Fordelerskap"));
  assert.equal(detailRead, true);
  assert.equal(result.publicSearchStatus, "available");
  assert.deepEqual(result.candidates.map(item => item.articleNumber), [article]);
  assert.equal(result.candidates[0].exactMatch, false);
});

function page(pageNumber: number, text: string): TechnicalDescriptionPage {
  return { pageNumber, text, method: "text", confidence: 0.99 };
}

test("a new sprinkler chapter cannot become continuation text for sanitary cabinet post 31.4.5", () => {
  for (const headerPosition of ["start", "end", "page-label"]) {
    const header = headerPosition === "page-label"
      ? "Prosjekt: Lunde 2 Side 33-1\n1 Orientering" : "Kapittel: 33 Brannslokking";
    const nextChapter = "Vannforsyning:\nSprinkleranlegg skal følge NS-EN 12845.\nFlexislanger: DN25";
    const result = extractTechnicalDescriptionFromPages([
      page(17, `Kapittel: 31 Sanitær\n31.4.5 UB1.25A\n${title}\nAntall stk 14\n`
        + Object.entries(attributes).map(([key, value]) => `${key}: ${value}`).join("\n")
        + "\nAndre krav:\nPosten gjelder nytt fordelerskap for tappevann.\nSum denne side:"),
      page(18, headerPosition === "start" ? `${header}\n${nextChapter}` : `${nextChapter}\n${header}`)
    ]);
    const cabinet = result.materialLines.find(line => line.postNumber === "31.4.5")!;
    assert.ok(cabinet);
    assert.equal(cabinet.category, "other");
    assert.equal(cabinet.quantity, 14);
    assert.equal(cabinet.attributes["antall utganger"], "5 Kv og 4 Vv");
    assert.deepEqual(cabinet.standardRefs, []);
    assert.doesNotMatch(cabinet.sourceText + cabinet.technicalSpecification, /12845|DN25|Vannforsyning/);
  }
});

test("a real same-chapter continuation still adds the remaining post requirements", () => {
  const result = extractTechnicalDescriptionFromPages([
    page(1, "Kapittel: 33 Brannslokking\n33.3.2 UE2.211A\nKONTROLLVENTILSETT\nAntall stk 1\nSum denne side:"),
    page(2, "Kapittel: 33 Brannslokking\nAndre krav:\nFølger NS-EN 12845. Leveres med retardasjonskammer.")
  ]);
  assert.ok(result.materialLines[0].standardRefs.includes("NS-EN-12845"));
  assert.match(result.materialLines[0].technicalSpecification!, /retardasjonskammer/);
});
