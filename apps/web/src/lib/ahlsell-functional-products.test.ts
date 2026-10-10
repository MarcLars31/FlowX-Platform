import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { complementMldlCandidates, findAhlsellHybridCandidates } from "./ahlsell-hybrid-matching";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";
import { ahlsellMldlCandidate } from "./ahlsell-mldl-catalog";

const luminaire = { category: "fitting", value_text: "LYSARMATUR FOR INTERIØRBELYSNING", value_json: {
  postNumber: "1401.40.442.16", nsCode: "XE1.21181935231A", quantity: 36, unit: "st", attributes: {
    montering: "Innfelt – tak", lyskilde: "Integrert LED-lyskilde", "armaturens mål": "ca L2400 x B65 x H65 mm.",
    "lystekniske krav": "Lumen ut: 5499 lm.", styring: "LED-driver for DALI-styring", kapslingsgrad: "IP20"
  }
} };
const valve = { category: "valve", value_text: "%SBB.018 - Energiventil DN20", value_json: {
  postNumber: "1403.50.562.8.1", nsCode: "UC2.963232611A", quantity: 2, unit: "st", parentPostNumber: "1403.50.562.8",
  attributes: { ventiltype: "Energiventil", dimensjon: "DN20", materiale: "Rustfritt stål", skjøt: "Gjengeskjøt",
    "databus-kommunikasjon": "Modbus RTU", "nominell spenning": "24 VAC/VDC" }
} };
const product = (productName: string, articleNumber = "1234567", specifications: string[] = []): AhlsellPublicCandidate => ({
  productName, articleNumber, manufacturer: "Test", productUrl: `https://www.ahlsell.no/products/${articleNumber}/`,
  specifications, source: "catalog_search", exactMatch: true
});

test("the reported luminaire uses short family queries and keeps all requirements for review", () => {
  assert.equal(ahlsellRequirementIntent(luminaire), "luminaire");
  const guide = buildAhlsellRequirementGuide(luminaire);
  assert.deepEqual(guide.searchQueries, ["Takarmatur innfelt DALI", "Lysarmatur", "LED armatur"]);
  assert.match(guide.searchUrl, /ahlsell.no/);
  assert.deepEqual(findMldlOnlyCandidates(luminaire), []);
  const [ranked] = rankAhlsellCandidates(luminaire, [product("Takarmatur Glamox Innfelt LED DALI")]);
  assert.equal(ahlsellCandidateMatchState(ranked), "review");
  assert.equal(ranked.exactMatch, false);
  assert.match(ranked.matchWarnings!.join(" "), /L2400.*5499.*DALI/);
  assert.doesNotMatch(ranked.matchWarnings!.join(" "), /DN65|skarv- eller anslutningstyp/);
});

test("luminaires cannot be replaced by dimmers, drivers, mounting hardware or emergency lights", () => {
  const names = ["Dimmer DALI for lysarmatur", "Driver LED armatur", "Oppheng for takarmatur", "Ledelysarmatur Exiway", "Takarmatur nødlys LED", "Kuleventil DN20"];
  assert.deepEqual(complementMldlCandidates(luminaire, [], names.map(n => product(n))), []);
  assert.equal(ahlsellRequirementIntent({ value_text: "Driver for lysarmatur", value_json: { nsCode: "XE1.2" } }), "generic");
  assert.equal(ahlsellRequirementIntent({ value_text: "LYSARMATUR FOR NØDBELYSNING", value_json: { nsCode: "XE1.2" } }), "generic");
});

test("recessed DALI luminaires rank before unknown mount/control and reject downlights for a 2400 by 65 mm body", () => {
  const ranked = rankAhlsellCandidates(luminaire, [product("Takarmatur ukjent", "1000001"),
    product("Takarmatur Innfelt DALI", "1000002"), product("Downlight DALI innfelt", "1000003")]);
  assert.equal(ranked[0].articleNumber, "1000002");
  assert.equal(ranked[0].exactMatch, false);
  assert.equal(ahlsellCandidateMatchState(ranked.find(c => c.articleNumber === "1000003")!), "mismatch");
});

test("the reported tagged energy valve excludes all the previously proposed clamps and hose nipples", () => {
  assert.equal(ahlsellRequirementIntent(valve), "energy_valve");
  assert.deepEqual(buildAhlsellRequirementGuide(valve).searchQueries, ["Energiventil DN20", "Energy Valve DN20", "Energiventil"]);
  assert.deepEqual(findMldlOnlyCandidates(valve), []);
  const wrong = ["9253474", "9253476", "9253479", "9253629", "9254871"].map(article => ahlsellMldlCandidate(article)!);
  assert.ok(wrong.every(Boolean));
  for (const candidate of rankAhlsellCandidates(valve, wrong)) assert.equal(ahlsellCandidateMatchState(candidate), "mismatch");
  assert.deepEqual(complementMldlCandidates(valve, wrong, wrong), []);
});

test("valve function remains mandatory even if a candidate shares DN, material and connection", () => {
  const specs = ["DN20", "Rustfritt stål", "Gjengeskjøt"];
  const wrong = ["Kuleventil DN20", "Innreguleringsventil DN20", "Aktuator for energiventil", "Energiventil tilbehør"];
  assert.deepEqual(complementMldlCandidates(valve, [], wrong.map(n => product(n, "1234567", specs))), []);
  const [right] = rankAhlsellCandidates(valve, [product("Energiventil DN20", "1234567", specs)]);
  assert.equal(ahlsellCandidateMatchState(right), "review");
  assert.equal(right.exactMatch, false);
  assert.match(right.matchWarnings!.join(" "), /energimätning.*Modbus RTU/);
  const control = { ...valve, value_text: "%SBB.018 - Reguleringsventil DN20", value_json: { ...valve.value_json, attributes: { dimensjon: "DN20" } } };
  assert.equal(ahlsellRequirementIntent(control), "control_valve");
  assert.deepEqual(buildAhlsellRequirementGuide(control).searchQueries, ["Reguleringsventil DN20", "Innreguleringsventil DN20"]);
});

test("unknown main products do not inherit arbitrary catalogue proposals from DN and thread alone", () => {
  assert.deepEqual(findMldlOnlyCandidates({ category: "unknown", value_text: "Ukjent hovedprodukt", value_json: {quantity: 2, unit: "st", attributes: {dimensjon: "DN20", skjøt: "Gjengeskjøt"}} }), []);
});

test("automatic searches retrieve light fixtures and exclude false family hits end to end", async () => {
  const queries: string[] = [];
  const fetcher = async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/search") {
      const query = url.searchParams.get("parameters.SearchPhrase")!;
      queries.push(query);
      return Response.json({ productCount: 2, productCards: query === "Takarmatur innfelt DALI" ? [
        { name: "Takarmatur Glamox Innfelt LED DALI", mostRelevantVariantId: "3319989", firstVariationPageUrl: "/products/elektro/3319989/" },
        { name: "Dimmer DALI", mostRelevantVariantId: "1478261", description: "For innfelt lysarmatur", firstVariationPageUrl: "/products/elektro/1478261/" }
      ] : [] });
    }
    return new Response("", { status: 404 });
  };
  const result = await findAhlsellHybridCandidates(luminaire, fetcher as typeof fetch);
  assert.ok(queries.includes("Takarmatur innfelt DALI"));
  assert.deepEqual(result.candidates.map(c => c.articleNumber), ["3319989"]);
  assert.equal(result.candidates[0].exactMatch, false);
});
