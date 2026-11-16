import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { complementMldlCandidates, findAhlsellHybridCandidates } from "./ahlsell-hybrid-matching";
import { productRequirementCategory } from "./product-requirement-category";
import { isCableTrunkingProduct } from "./ahlsell-cable-trunking";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";

const requirement = { category: "unknown", value_text: "VEGGKANAL – LENGDE", value_json: {
  nsCode: "WC2.511115", postNumber: "1401.40.411.35", quantity: 71.75, unit: "m",
  reviewFlags: ["unknown-category"], attributes: { materiale: "Aluminium", "dimensjon (hxd)": "123 x 70 mm",
    "antall rom i kanal": "2 stk", montasje: "Utpåliggende på vegg" }
} };
const candidate = (productName: string, articleNumber: string, description = "Aluminium"): AhlsellPublicCandidate => ({
  productName, articleNumber, description, manufacturer: "Test", specifications: [], source: "catalog_search",
  productUrl: `https://www.ahlsell.no/products/elektro/${articleNumber}/`, exactMatch: true, matchScore: 100
});

test("wall channels in metres search for channels without quantity words, pipe DN or sprinkler terms", () => {
  for (const category of ["unknown", "pipe", "fitting"]) {
    const row = { ...requirement, category };
    assert.equal(ahlsellRequirementIntent(row), "cable_trunking");
    assert.equal(productRequirementCategory(row), "cable_trunking");
    assert.deepEqual(findMldlOnlyCandidates(row), []);
    const guide = buildAhlsellRequirementGuide(row);
    assert.ok(guide.searchQueries.includes("Veggkanal"));
    assert.doesNotMatch(guide.searchQueries.join(" "), /lengde|sprinkler|DN|71[.,]75|123|70/i);
    assert.doesNotMatch(guide.criteria.join(" "), /DN|sprinkler/i);
    assert.match(guide.criteria.join(" "), /123 x 70 mm/);
    assert.equal(new URL(guide.searchUrl).hostname, "www.ahlsell.no");
  }
  assert.equal(requirement.value_json.quantity, 71.75);
});

test("measurement suffixes are removed from generic catalogue queries without changing the PDF heading", () => {
  for (const suffix of ["LENGDE", "ANTALL", "AREAL"]) {
    const row = { value_text: `TELESKOPMAST – ${suffix}`, value_json: { unit: "st" } };
    assert.deepEqual(buildAhlsellRequirementGuide(row).searchQueries, ["TELESKOPMAST"]);
    assert.equal(row.value_text, `TELESKOPMAST – ${suffix}`);
  }
});

test("channel bodies remain proposals requiring HxD and compartment review; lids and corners are excluded", () => {
  for (const name of ["Kanalunderdeler Schneider INKA", "Installasjonskanal Wibe", "Kabelkanal med lokk"]) {
    assert.equal(isCableTrunkingProduct(name), true);
    const [ranked] = rankAhlsellCandidates(requirement, [candidate(name, "1280399")]);
    assert.equal(ahlsellCandidateMatchState(ranked), "review");
    assert.equal(ranked.exactMatch, false);
    assert.match(ranked.matchWarnings!.join(" "), /123 x 70 mm.*2 stk/);
    assert.doesNotMatch(ranked.matchWarnings!.join(" "), /DN123|huvudprodukt har inte kunnat identifieras/);
  }
  const wrong = ["Front installasjonskanal Schneider", "Installasjonskanal Innehjørne Schneider",
    "Endestykke til veggkanal", "Tilbehør Rehau Signa lokk", "Stålrør sprinkler DN125"];
  for (const name of wrong) assert.equal(isCableTrunkingProduct(name), false, name);
  assert.deepEqual(complementMldlCandidates(requirement, [], wrong.map((name, i) => candidate(name, String(1000000 + i)))), []);
  const [plastic] = rankAhlsellCandidates(requirement, [candidate("Veggkanal TEK 123", "1210519", "Laget av plast/PVC")]);
  assert.equal(ahlsellCandidateMatchState(plastic), "mismatch");
  assert.match(plastic.matchWarnings!.join(" "), /material stämmer inte.*aluminium/);
});

test("automatic public search keeps channel proposals and filters accessories end to end", async () => {
  const queries: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/search") {
      const query = url.searchParams.get("parameters.SearchPhrase")!;
      queries.push(query);
      return Response.json({ productCount: 2, productCards: query === "Veggkanal" ? [
        { name: "Kanalunderdeler Schneider INKA", mostRelevantVariantId: "1280399", brand: "Schneider", description: "Aluminium",
          firstVariationPageUrl: "https://www.ahlsell.no/products/elektro/1280399/" },
        { name: "Front installasjonskanal Schneider", mostRelevantVariantId: "1277430", brand: "Schneider",
          firstVariationPageUrl: "https://www.ahlsell.no/products/elektro/1277430/" }
      ] : [] });
    }
    return new Response("", { status: 404 });
  };
  const result = await findAhlsellHybridCandidates(requirement, fetcher as typeof fetch);
  assert.ok(queries.includes("Veggkanal"));
  assert.doesNotMatch(queries.join(" "), /sprinkler|DN123|LENGDE/i);
  assert.deepEqual(result.candidates.map(c => c.articleNumber), ["1280399"]);
  assert.equal(result.candidates[0].exactMatch, false);
});
