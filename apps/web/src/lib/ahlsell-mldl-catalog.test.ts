import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { complementMldlCandidates } from "./ahlsell-hybrid-matching";

test("retrieves the main equipment family instead of a mentioned component", () => {
  for (const [description, attrs, intent] of [
    ["PUMPE INNENDØRS", { "type pumpe": "Neddykket", tilleggsutstyr: "Tilbakeslagsventil DN50" }, "pump"],
    ["INNENDØRS PARTIKKELUTSKILLER", { "type partikkelutskiller": "Sil (netting)", dimensjon: "DN100" }, "strainer"],
    ["INNENDØRS STENGEVENTIL", { ventiltype: "Kuleventil", dimensjon: "DN100" }, "ball_valve"],
    ["KONTROLLVENTILSETT FOR SPRINKLERANLEGG", { "type kontrollventilsett": "Våt alarmventil", dimensjon: "DN100" }, "wet_alarm_valve"],
    ["INNENDØRS RØRLEDNING - BRANNSLOKKING - RØR", { "slokkeanlegg/-medium": "Vannmåler" }, "water_meter"]
  ] as const) {
    const requirement = { category: "control", value_text: description, value_json: { attributes: attrs }, source_excerpt: "Inkl. stengeventiler og manometer." };
    assert.equal(ahlsellRequirementIntent(requirement), intent);
    const found = findAhlsellMldlCandidates(requirement);
    assert.ok(found.every(candidate => !/spjeldventil|Y-rør/i.test(candidate.productName)));
  }
});
import {
  AHLSELL_MLDL_PRODUCT_COUNT,
  ahlsellMldlCandidate,
  ahlsellMldlProducts,
  findAhlsellMldlCandidates
} from "./ahlsell-mldl-catalog";

const completeToiletRequirement = {
  // Older extraction sees "avstengningsventil" and stores the valve category.
  category: "valve", value_text: "KLOSETT – KOMPLETT",
  value_json: {
    nsCode: "UF1.21206912A", postNumber: "31.4.1", quantity: 14, unit: "stk",
    attributes: {
      brukskategori: "For bevegelseshemmede", materiale: "Valgfritt", plassering: "På vegg",
      montering: "Veggmontert og i henhold til leverandørspesifikasjon",
      spylesystem: "Sisterne påbygd", vannlås: "Skjult", utforming: "Se andre krav",
      farge: "Avklares med byggherre", sete: "Se andre krav", sisterne: "Se andre krav",
      avstengningsventil: "Valgfritt"
    },
    technicalSpecification: "Leveres med støttehåndtak: Lengde 900mm, og skal tåle min. 250kg. "
      + "Elektrisk høydejustering 200mm, fra 410-610mm. løftekapasitet på minimum 300kg. "
      + "Med klemsikring. Toalettmodulen skal være sertifisert for å tåle en belastning på minimum 500kg. "
      + "Uten spylekant. Leveres med ryggstøtte."
  }
};

test("uses the complete toilet as the main product despite included valves and a stale category", () => {
  for (const category of ["valve", "unknown"]) {
    const requirement = { ...completeToiletRequirement, category };
    assert.equal(ahlsellRequirementIntent(requirement), "toilet");
    assert.deepEqual(findAhlsellMldlCandidates(requirement), []);
  }
  assert.equal(ahlsellRequirementIntent({ category: "valve", value_text: "Kuleventil for WC DN15" }), "ball_valve");
});

test("searches for an electrically adjustable toilet without sprinkler orientation or invented pipe dimensions", () => {
  const guide = buildAhlsellRequirementGuide(completeToiletRequirement);
  assert.ok(guide.searchQueries.every(query => /Toalett.*elektrisk/.test(query)));
  assert.ok(guide.criteria.includes("Toalett"));
  assert.ok(guide.criteria.includes("Elektrisk höjdjustering"));
  assert.doesNotMatch(guide.criteria.join(" "), /sprinkler|HSW|Pendent|DN\d/i);
  assert.ok(guide.warnings.some(warning => /tilläggskraven/.test(warning)));
  assert.deepEqual(guide.directCandidates, []);
});

test("rejects all twenty valve alternatives reported for toilet post 31.4.1, including inherited exact matches", () => {
  const articles = ["9256649", "9256653", "9256646", "9255289", "9256647", "9256648", "9256651",
    "9255769", "9253499", "9253207", "9253208", "9253209", "9253502", "9253496", "9253204",
    "9253497", "9253205", "9253498", "9253206", "9253211"];
  const candidates = articles.map(article => {
    const candidate = ahlsellMldlCandidate(article);
    assert.ok(candidate, `Missing regression article ${article}`);
    return { ...candidate, exactMatch: true, recommendation: "recommended" as const, matchScore: 100 };
  });
  const assessed = [
    ...rankAhlsellCandidates(completeToiletRequirement, candidates),
    // A public hit for the same NRF must not restore the old green assessment.
    ...complementMldlCandidates(completeToiletRequirement, candidates, candidates.map(candidate => ({
      ...candidate, source: "public_verified" as const
    })))
  ];
  for (const candidate of assessed) {
    assert.equal(ahlsellCandidateMatchState(candidate), "mismatch", candidate.articleNumber);
    assert.equal(candidate.exactMatch, false);
    assert.equal(candidate.recommendation, "unlikely");
    assert.ok(candidate.matchWarnings?.some(warning => warning.startsWith("Fel produkttyp:")));
  }
});

test("keeps toilet candidates under review until the complete assembly and additional requirements are verified", () => {
  const names = ["Vegghengt klosett uten spylekant", "Toalettmodul elektrisk høydejustering 410-610mm 300kg"];
  const candidates = names.map((productName, index) => ({
    articleNumber: `toilet-test-${index}`, productName, manufacturer: "Test", productUrl: "https://example.com/toilet",
    specifications: [], source: "public_verified" as const, exactMatch: true,
    recommendation: "recommended" as const, matchScore: 100
  }));
  for (const candidate of rankAhlsellCandidates(completeToiletRequirement, candidates)) {
    assert.equal(ahlsellCandidateMatchState(candidate), "review");
    assert.equal(candidate.exactMatch, false);
    assert.ok(candidate.matchWarnings?.some(warning => /tilläggskraven/.test(warning)));
  }
});

test("keeps a dedicated guard row searchable when an older extraction labels it sprinkler_head", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "sprinkler_head", value_text: "Beskyttelsesgitter for sprinkler DN15"
  });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((item) => ahlsellMldlProducts().find((product) => product.articleNumber === item.articleNumber)?.productType === "sprinkler_accessory"));
});

test("keeps the main sprinkler family when its specification also requests accessories", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "sprinkler_head",
    value_text: "Sprinklerhode K80 DN15 68C QR pendent messing med rosett",
    value_json: { attributes: { beskyttelse: "Gitter" } }
  });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((item) => ahlsellMldlProducts().find((product) => product.articleNumber === item.articleNumber)?.productType === "sprinkler_head"));
});

test("imports the complete MLDL assortment without duplicate article numbers", () => {
  const products = ahlsellMldlProducts();
  assert.equal(AHLSELL_MLDL_PRODUCT_COUNT, 759);
  assert.equal(products.length, 759);
  assert.equal(new Set(products.map((product) => product.articleNumber)).size, 759);
});

test("ranks the known V761 butterfly valve from the full database", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "valve",
    value_text: "114.3mm spjeldventil sort V761 rillet PN20 - VKS"
  });

  assert.equal(candidates[0]?.articleNumber, "9253207");
  assert.equal(candidates[0]?.source, "structured_database");
  assert.equal(candidates[0]?.recommendation, "recommended");
  assert.ok((candidates[0]?.matchScore ?? 0) >= 90);
});

test("uses Norwegian product words to restrict the database to the right family", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "fitting",
    value_text: "76,1 mm fast kupling rillet"
  });

  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => /kupling|kobling|coupling/i.test(candidate.productName)));
});

test("uses UB1.3311 to exclude rigid pipes and fittings from the MLDL pool", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "pipe",
    value_text: "INNENDØRS RØRLEDNING - BRANNSLOKKING - SLANGE",
    value_json: {
      nsCode: "UB1.33114699900A",
      unit: "st",
      attributes: { dimensjon: "DN25" }
    }
  });

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0]?.articleNumber, "9255525");
  assert.ok(candidates.every((candidate) =>
    /sprinklerslange|sprinkler slange|vicflex|dryflex|fleksibelslange/i.test(candidate.productName)
  ));
  assert.ok(candidates.every((candidate) => !/konstruksjonsrør|t-rør|bend t\/sprinklerslange|nippel f\/.*sprinklerslange/i.test(candidate.productName)));
});

test("selects NRF 9253499 for the supervised-open DN100 handwheel valve", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "valve",
    requirement_key: "UC1.9111118A",
    value_text: "INNENDØRS STENGEVENTIL",
    value_json: { attributes: {
      ventiltype: "Dreiespjeldventil med tilkobling for signal ved stengt ventil, myk stenging.",
      betjening: "Manuell med ratt",
      materiale: "Støpejern",
      skjøt: "Rilleskjøt",
      "dimensjon, tilkoblinger": "DN100"
    } }
  });

  assert.equal(candidates[0]?.articleNumber, "9253499");
  assert.equal(candidates[0]?.recommendation, "recommended");
  assert.ok(candidates[0]?.evidenceSources?.includes("victaulic_verified"));
  assert.ok(candidates[0]?.matchReasons?.some((reason) => reason.includes("övervakad i öppet")));
  assert.ok(candidates.slice(1, 4).every((candidate) => candidate.recommendation !== "recommended"));
});

test("selects the LC Eidsvoll V2763 brass head for PDF post 33.500.2", () => {
  const candidates = findAhlsellMldlCandidates({
    category: "sprinkler_head",
    requirement_key: "UE2.11111232",
    value_text: "SPRINKLER",
    value_json: { attributes: {
      sprinkleranlegg: "Våtanlegg",
      "type sprinkler": "Konvensjonell sprinkler",
      plassering: "Hengende i tak",
      følsomhetsgrad: "Standard-respons A",
      utløsningstemperatur: "68 °C",
      "k-faktor": "80",
      trykk: "PN10",
      "gjengedimensjon (dn)": "DN25",
      overflatebehandling: "Som standard for produkt",
      "dekkskive/pyntering (ved innfelling)": "Ingen",
      beskyttelse: "Ingen"
    } }
  });

  assert.equal(candidates[0]?.articleNumber, "9257387");
  assert.equal(candidates[0]?.assortmentPriority, 1);
  assert.ok(candidates[0]?.matchReasons?.some((reason) => reason.includes("LC Eidsvoll")));
  assert.ok(candidates[0]?.matchWarnings?.some((warning) => warning.includes("DN25") && warning.includes("DN15")));
  assert.ok(candidates.slice(0, 3).every((candidate) => !/skjult|concealed/i.test(`${candidate.productName} ${candidate.description}`)));
});
