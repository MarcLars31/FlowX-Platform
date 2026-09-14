import assert from "node:assert/strict";
import test from "node:test";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";
import { findAhlsellMldlCandidates } from "./ahlsell-mldl-catalog";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

test("preserves conflicting live evidence for review while enriching verified data", () => {
  const [merged] = mergeAhlsellCandidates([
    candidate("9257423", "V2762", "verified_database", true)
  ], [{
    ...candidate("9257423", "Sprinklerhoder Modell V2762 Victaulic FireLock", "catalog_search", false),
    imageUrl: "https://example.test/image.jpg",
    description: "Aktuell Ahlsell-beskrivning",
    matchWarnings: ["Fel dimension: PDF kräver DN15, träffen anger DN20."]
  }]);

  assert.equal(merged.source, "verified_database");
  assert.equal(merged.exactMatch, false);
  assert.equal(merged.matchWarnings?.length, 1);
  assert.notEqual(merged.recommendation, "recommended");
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

test("marks the same NRF in MLDL and the public catalogue as stronger evidence", () => {
  const [merged] = mergeAhlsellCandidates(
    [candidate("9253207", "MLDL V761", "structured_database", false)],
    [candidate("9253207", "Ahlsell V761", "catalog_search", false)]
  );

  assert.deepEqual(merged.evidenceSources, ["mldl_database", "ahlsell_public"]);
  assert.match(merged.matchReasons?.join(" ") ?? "", /både Ahlsells MLDL-databas och den aktuella offentliga katalogen/);
  assert.equal(merged.matchScore, 88);
  assert.equal(merged.recommendation, "recommended");
});

test("keeps matching brass 68C quick-response heads first after catalog results arrive", () => {
  const requirement = {
    category: "sprinkler_head", value_text: "SPRINKLER", requirement_key: "30.332.14",
    value_json: { nsCode: "UE2.11112912", attributes: {
      sprinkleranlegg: "Våtanlegg", "type sprinkler": "Spraysprinkler",
      plassering: "Hengende synlig i tak og over systemhimling",
      følsomhetsgrad: "Kvikk respons", utløsningstemperatur: "68 °C",
      "k-faktor": "80", trykk: "12 bar", "gjengedimensjon (dn)": "15",
      overflatebehandling: "Messing", "dekkskive/pyntering (ved innfelling)": "|.R.",
      beskyttelse: "Nei"
    } }
  };
  const direct = buildAhlsellRequirementGuide(requirement).directCandidates;
  const database = findAhlsellMldlCandidates(requirement, 50);
  const merged = mergeAhlsellCandidates(direct, database);

  // Incompatible variants cannot regain high scores through catalogue bonuses.
  assert.ok(merged.filter(item => /Fel temperatur|responstid stämmer inte|ytfinish stämmer inte/.test(item.matchWarnings?.join(" ") ?? ""))
    .every(item => item.matchScore! <= 34));
  assert.deepEqual(merged.slice(0, 2).map((item) => item.articleNumber).sort(), ["9254064", "9257392"]);
  assert.equal(merged[0].articleNumber, "9257392");
  assert.ok(!merged[0].matchWarnings?.some(warning => /arbetstryck/.test(warning)));
  const legacy = merged.find(item => item.articleNumber === "9254064")!;
  assert.equal(legacy.exactMatch, false);
  assert.match(legacy.matchWarnings!.join(" "), /arbetstryck behöver verifieras/);
  // The client merges the same direct assessment again when showing the card.
  assert.deepEqual(mergeAhlsellCandidates(direct, merged), merged);
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
