import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { productRequirementCategory } from "./product-requirement-category";
import { electricalHeatingRequirements } from "./ahlsell-electrical-heating";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { assessAhlsellLookupCandidates, complementMldlCandidates, findAhlsellHybridCandidates } from "./ahlsell-hybrid-matching";
import { groupAhlsellCandidatesForDisplay } from "./product-card-candidates";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";

const heater = { category: "fitting", value_text: "ELEKTRISK VARMEOVN", value_json: {
  postNumber: "1401.40.452.1", nsCode: "XC1.1321", quantity: 6, unit: "st", attributes: {
    type: "Panelovn", regulering: "Bryter av/på og elektronisk termostat", kapslingsgrad: "IP23",
    tilkobling: "Fast tilkobling", lokalisering: "I henhold til plantegninger, komponentkode %LHB.003.",
    "rommets funksjon": "Romoppvarming", "nominell spenning": "230 V", effekt: "500 W",
    montasje: "Utpåliggende på vegg", automatikkfunksjoner: "Integrert termovern. Styring fra SD-anlegg."
  }
} };
const product = (productName: string, articleNumber = "1234567", specifications: string[] = []): AhlsellPublicCandidate => ({
  productName, articleNumber, manufacturer: "Test", productUrl: `https://www.ahlsell.no/products/${articleNumber}/`,
  specifications, source: "catalog_search", exactMatch: true
});
const unrelated = [
  product("Adapter Bosch GDE 16 Professional", "384637"), product("Aktuator elektrisk Blue e-torq", "5521141"),
  product("Bits Bosch for MA55 og GMA55", "392208"), product("Bits Milwaukee PH2 148 mm 3P", "495111"),
  product("Elektrisk rørbøyer REMS Curvo", "19000641"), product("Elektrisk rørkutter Cento REMS", "19000075")
];

test("1401.40.452.1 searches the PDF's Panelovn, power and voltage, not a generic electrical word", () => {
  assert.equal(productRequirementCategory(heater), "electrical_heating");
  assert.equal(ahlsellRequirementIntent(heater), "electric_heater");
  const guide = buildAhlsellRequirementGuide(heater);
  assert.deepEqual(guide.searchQueries, ["Panelovn 500W 230V", "Panelovn 500W", "Panelovn"]);
  assert.match(guide.criteria.join(" "), /IP23.*Fast tilkobling/);
  assert.doesNotMatch(guide.searchQueries.join(" "), /LHB|sprinkler|Victaulic|ELEKTRISK VARMEOVN/i);
  assert.deepEqual(findMldlOnlyCandidates(heater), []);
});

test("all eight electric heater posts in the supplied specification keep their own type, voltage and power", () => {
  const cases = [
    ["1401", "XC1.1321", "Panelovn", "500 W", "IP23"],
    ["1402", "XC1.1991", "Panelovn", "1000 W", "IP23"],
    ["1402", "XC1.1991", "Panelovn", "500 W", "IP23"],
    ["1403", "XC1.2911", "Gjennomstrømningsovn", "1000 W", "IP20"],
    ["1406", "XC1.2312", "Gjennomstrømningsovn", "1000 W", "IP20"],
    ["1407", "XC1.1391", "Panelovn", "1000 W", "IP23"],
    ["1408", "XC1.1391", "Panelovn", "1000 W", "IP24"],
    ["1409", "XC1.1321", "Panelovn", "1000 W", "IP23"]
  ];
  for (const [building, nsCode, type, effekt, kapslingsgrad] of cases) {
    const requirement = { ...heater, category: "control", value_json: { ...heater.value_json, nsCode,
      postNumber: `${building}.40.452.1`, attributes: { ...heater.value_json.attributes, type, effekt, kapslingsgrad,
        lokalisering: "Teknisk for sprinkler", dimensjoner: "Lengde 400mm, bredde 600 mm, dybde 52 mm" } } };
    assert.equal(ahlsellRequirementIntent(requirement), "electric_heater");
    assert.equal(productRequirementCategory(requirement), "electrical_heating");
    assert.equal(buildAhlsellRequirementGuide(requirement).searchQueries[0], `${type} ${effekt.replace(" ", "")} 230V`);
    const [ranked] = rankAhlsellCandidates(requirement, [product(`${type} ${effekt} 230V`)]);
    assert.doesNotMatch(ranked.matchWarnings!.join(" "), /DN|tryckklass|rördimension|skarv-/i);
  }
});

test("all reported unrelated articles and loose heater accessories are excluded automatically", () => {
  const wrong = [...unrelated, product("Termostat for panelovn"), product("Veggfestesett til varmeovn"), product("Adapter panelovn"), product("Kontrollenhet Panelovn Nobø SPC", "5422475")];
  assert.deepEqual(complementMldlCandidates(heater, wrong, wrong), []);
  for (const candidate of rankAhlsellCandidates(heater, wrong)) assert.equal(ahlsellCandidateMatchState(candidate), "mismatch");
  const manual = assessAhlsellLookupCandidates(heater, unrelated);
  assert.equal(manual.length, unrelated.length);
  assert.ok(manual.every(candidate => ahlsellCandidateMatchState(candidate) === "mismatch"));
});

test("power and voltage are article constraints, while missing evidence stays review", () => {
  const candidates = [product("Panelovn 500W 230V IP23", "1000001"), product("Panelovn 1000W 230V", "1000002"),
    product("Panelovn 500W 400V", "1000003"), product("Panelovn", "1000004")];
  const ranked = rankAhlsellCandidates(heater, candidates);
  const byId = new Map(ranked.map(candidate => [candidate.articleNumber, candidate]));
  assert.equal(ranked[0].articleNumber, "1000001");
  assert.equal(ahlsellCandidateMatchState(byId.get("1000001")!), "review");
  assert.equal(byId.get("1000001")!.exactMatch, false);
  assert.match(byId.get("1000001")!.matchWarnings!.join(" "), /SD-anlegg/);
  assert.equal(ahlsellCandidateMatchState(byId.get("1000002")!), "mismatch");
  assert.equal(ahlsellCandidateMatchState(byId.get("1000003")!), "mismatch");
  assert.equal(ahlsellCandidateMatchState(byId.get("1000004")!), "review");
  assert.equal(groupAhlsellCandidatesForDisplay(ranked).review.length, 2);
});

test("family prose does not verify article wattage; labelled article data and subtitle can", () => {
  const family = { ...product("Panelovn"), description: "Finnes i 500W og 1000W, 230V", specifications: ["Serien leveres i 500W og 1000W, 230V"] };
  const [unknown] = rankAhlsellCandidates(heater, [family]);
  assert.match(unknown.matchWarnings!.join(" "), /Effekt 500 W behöver verifieras/);
  const [documented] = rankAhlsellCandidates(heater, [{ ...family, specifications: ["Effekt (W): 500", "Spenning: 230V"], subtitle: "Panelovn 0,5kW" }]);
  assert.doesNotMatch(documented.matchWarnings!.join(" "), /Effekt 500 W behöver verifieras|Fel effekt/);
  const [range] = rankAhlsellCandidates(heater, [product("Panelovn 500W 230/400V")]);
  assert.doesNotMatch(range.matchWarnings!.join(" "), /Fel spänning/);
  assert.equal(range.exactMatch, false);
});

test("cable posts are electrical heating, without confusing watts per metre, area and total watts", () => {
  for (const [effekt, unit] of [["900 W", "W"], ["10 W/m", "W/m"], ["90 W/m²", "W/m²"], ["90 W/m2", "W/m²"]]) {
    const requirement = { ...heater, value_text: "ELEKTRISK VARMEELEMENT", value_json: { ...heater.value_json,
      nsCode: "XC2.4113A", attributes: { elementtype: "Toleder varmekabel", temperaturavhengighet: "Temperaturavhengig elementeffekt (selvregulerende)", effekt, "nominell spenning": "230 V" } } };
    assert.equal(ahlsellRequirementIntent(requirement), "heating_cable");
    assert.equal(productRequirementCategory(requirement), "electrical_heating");
    assert.equal(electricalHeatingRequirements(requirement).power!.unit, unit);
    assert.match(buildAhlsellRequirementGuide(requirement).searchQuery, /^Varmekabel selvregulerende/);
    assert.deepEqual(complementMldlCandidates(requirement, [], unrelated), []);
    if (unit !== "W") {
      const [candidate] = rankAhlsellCandidates(requirement, [product("Varmekabel 900W 230V")]);
      assert.match(candidate.matchWarnings!.join(" "), /Effekt .* behöver verifieras/);
      assert.doesNotMatch(candidate.matchWarnings!.join(" "), /Fel effekt/);
    }
  }
});

test("unknown families require product identity, not shared words or a supplier's description", () => {
  const requirement = { value_text: "ELEKTRISK KABELSTIGE", value_json: { nsCode: "WC2.522A", attributes: {} } };
  const candidates = [...unrelated, { ...product("Adapter", "2000001"), description: "Elektrisk, for kabelstige" }, product("Kabelstige stål", "2000002")];
  assert.deepEqual(complementMldlCandidates(requirement, [], candidates).map(candidate => candidate.articleNumber), ["2000002"]);
  assert.deepEqual(complementMldlCandidates({ value_text: "Ukjent teknisk produkt" }, [], candidates), []);
  assert.equal(ahlsellRequirementIntent({ value_text: "Adapter for panelovn", value_json: { nsCode: "WC2.522A" } }), "generic");
});

test("hybrid heater search filters unrelated products before spending requests on their details", async () => {
  const detailRequests: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/search") return Response.json({ productCount: 7, productCards: [
      ...unrelated, product("Panelovn 500W 230V", "1000001")
    ].map(candidate => ({ name: candidate.productName, mostRelevantVariantId: candidate.articleNumber, firstVariationPageUrl: `/products/elektro/${candidate.articleNumber}/` })) });
    detailRequests.push(url.pathname);
    return new Response("", { status: 404 });
  };
  const result = await findAhlsellHybridCandidates(heater, fetcher as typeof fetch);
  assert.deepEqual(result.candidates.map(candidate => candidate.articleNumber), ["1000001"]);
  assert.ok(detailRequests.every(path => !unrelated.some(candidate => path.includes(candidate.articleNumber))));
});
