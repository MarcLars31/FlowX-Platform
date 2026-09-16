import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellCandidateMatchState, rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { complementMldlCandidates, findAhlsellHybridCandidates } from "./ahlsell-hybrid-matching";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";

const dimensions = [25, 32, 40, 50, 65];
const pipeGroups = [
  { parent: "33.2.2", code: "UB1.31114312099", material: "Stål", joint: "Gjenget eller rilleskjøt", lengths: [303, 68, 204, 62, 325], extra: "" },
  { parent: "33.2.3", code: "UB1.31114900099A", material: "Stål – malingsbehandlet", joint: "Rilleskjøt eller rilleskjøt", lengths: [110, 15, 20, 10, 90], extra: "Rør leveres hvit RAL 9010. Rengjort og grundet, kappede ender flekkmales." },
  { parent: "33.2.4", code: "UB1.31114600099A", material: "Stål – rustfritt", joint: "Rilleskjøt eller rilleskjøt", lengths: [3], extra: "Rør fra inntak til stengeventil leveres rustfritt." }
];
const pipes = pipeGroups.flatMap(group => group.lengths.map((quantity, index) => {
  const dn = group.lengths.length === 1 ? 65 : dimensions[index];
  const description = `DN ${dn} komplett med deler bend, albuer, t- stykker,endebunn og oppheng`;
  return { category: "fitting", value_text: description, value_json: {
    postNumber: `${group.parent}.${index + 1}`, parentPostNumber: group.parent, nsCode: group.code,
    quantity, unit: "m", attributes: { materiale: group.material, skjøt: group.joint, trykk: "PN 16", dimensjon: `DN${dn}` },
    technicalSpecification: `${group.parent} ${group.code}\nINNENDØRS RØRLEDNING – BRANNSLOKKING – KOMPLETT\n${group.extra}`
  } };
}));
const candidate = (name: string, article = "test-product"): AhlsellPublicCandidate => ({
  productName: name, articleNumber: article, manufacturer: "Test", specifications: [],
  productUrl: `https://www.ahlsell.no/products/sprinkler/${article}/`, source: "public_verified", exactMatch: true
});
const warnings = (item: AhlsellPublicCandidate) => item.matchWarnings?.join(" ") ?? "";

test("all eleven complete pipe rows retain their DN and lengths instead of searching for end caps", () => {
  assert.equal(pipes.length, 11);
  assert.equal(pipes.reduce((sum, row) => sum + row.value_json.quantity, 0), 1210);
  for (const row of pipes) {
    assert.equal(ahlsellRequirementIntent(row), "pipe", row.value_json.postNumber);
    const guide = buildAhlsellRequirementGuide(row);
    assert.ok(guide.criteria.includes(row.value_json.attributes.dimensjon));
    assert.match(guide.searchQueries.join(" "), /rør/);
    assert.doesNotMatch(guide.searchQueries.join(" "), /endebunn|endelokk|bend/i);
    assert.match(guide.warnings.join(" "), /ritning|delar/);
  }
  assert.equal(ahlsellRequirementIntent({ category: "fitting", value_text: "Bend DN25", value_json: { nsCode: "UB1.31114312099" } }), "bend");
});

test("fresh PDF extraction classifies complete pipe lengths without losing their quantities", () => {
  const group = pipeGroups[0];
  const extracted = extractTechnicalDescriptionFromPages([{ pageNumber: 20, method: "text", confidence: 0.99,
    text: `Kapittel: 33 Brannslokking\n${group.parent} ${group.code}\nINNENDØRS RØRLEDNING - BRANNSLOKKING - KOMPLETT\nMateriale: Stål\nSkjøt: ${group.joint}\nTrykk: PN 16\nDimensjon: Se underposter\n`
      + pipes.slice(0, 5).map(row => `${row.value_json.postNumber} ${row.value_text}\nLengde m ${row.value_json.quantity},00`).join("\n")
  }]);
  const rows = extracted.materialLines.filter(row => row.quantity !== undefined);
  assert.deepEqual(rows.map(row => [row.postNumber, row.category, row.quantity, row.unit]),
    pipes.slice(0, 5).map(row => [row.value_json.postNumber, "pipe", row.value_json.quantity, "m"]));
});

test("threaded or grooved DN25 pipe remains a partial assembly; wrong sizes and fittings are conflicts", () => {
  for (const joint of ["gjenget", "rillet"]) {
    const [result] = rankAhlsellCandidates(pipes[0], [candidate(`Stålrør DN25 PN16 ${joint}`)]);
    assert.equal(ahlsellCandidateMatchState(result), "review", warnings(result));
    assert.match(warnings(result), /upphängning/);
    assert.doesNotMatch(warnings(result), /skarv.*stämmer inte/);
  }
  const wrong = ["Stålrør DN32 PN16 gjenget", "Endelokk DN25 PN16 stål", "Bend DN25 PN16 stål", "T-rør DN25 PN16 stål"];
  for (const name of wrong) {
    const [result] = rankAhlsellCandidates(pipes[0], [candidate(name)]);
    assert.equal(ahlsellCandidateMatchState(result), "mismatch", name);
    assert.equal(result.exactMatch, false);
  }
  assert.deepEqual(complementMldlCandidates(pipes[0], [], wrong.slice(1).map(name => candidate(name))), []);
});

test("stainless and white painted rows keep their distinct requirements", () => {
  const stainless = pipes[10];
  assert.match(buildAhlsellRequirementGuide(stainless).searchQueries.join(" "), /Rustfri/);
  const [steel] = rankAhlsellCandidates(stainless, [candidate("Stålrør DN65 PN16 rillet")]);
  assert.equal(ahlsellCandidateMatchState(steel), "mismatch");
  assert.match(warnings(steel), /material stämmer inte/);
  const [correct] = rankAhlsellCandidates(stainless, [candidate("Rustfrie rør DN65 PN16 rillet")]);
  assert.equal(ahlsellCandidateMatchState(correct), "review", warnings(correct));
  assert.doesNotMatch(warnings(correct), /material.*verifieras|material stämmer inte/);
  const painted = pipes[5];
  assert.match(buildAhlsellRequirementGuide(painted).criteria.join(" "), /RAL 9010/);
  const [paint] = rankAhlsellCandidates(painted, [candidate("Stålrør DN25 PN16 rillet hvit RAL 9010")]);
  assert.equal(ahlsellCandidateMatchState(paint), "review");
  assert.match(warnings(paint), /grundning.*bättring/);
});

const alarm = { category: "control", value_text: "ALARMGIVER Det skal leveres komplett sett inkl. ekstra alarmgiver for montasje på alarmventilsett Type Tyco KIT5 el. tilsvarende",
  value_json: { postNumber: "33.3.2.1", parentPostNumber: "33.3.2", nsCode: "UE2.211A", quantity: 2, unit: "st",
    attributes: { "type kontrollventilsett": "Våt alarmventil", "dimensjon (dn)": "65", trykk: "12 bar", "type tilkobling": "Rille eller flens" } } };
test("alarm child searches for its own set without imposing the parent's DN65 valve connection", () => {
  assert.equal(ahlsellRequirementIntent(alarm), "alarm_device");
  const guide = buildAhlsellRequirementGuide(alarm);
  assert.ok(guide.searchQueries.includes("Tyco KIT5"));
  assert.doesNotMatch(guide.searchQueries.join(" ") + guide.criteria.join(" "), /DN65|76\.1/);
  const device = { ...candidate("Alarmpressostat DN15"), specifications: ["Max arbeidstrykk 16 bar"] };
  const [result] = rankAhlsellCandidates(alarm, [device]);
  assert.equal(ahlsellCandidateMatchState(result), "review", warnings(result));
  assert.match(warnings(result), /extra alarmgivare.*kompatibilitet/);
  assert.doesNotMatch(warnings(result), /Fel dimension|DN65/);
  const [valve] = rankAhlsellCandidates(alarm, [candidate("Våt alarmventil DN65")]);
  assert.equal(ahlsellCandidateMatchState(valve), "mismatch");
});

const shutoff = { category: "control", value_text: "DN 65 til kapasitetsmåler uten overvåking", value_json: {
  postNumber: "33.3.6.3", parentPostNumber: "33.3.6", nsCode: "UC1", quantity: 2, unit: "st", attributes: { dimensjon: "DN65" },
  technicalSpecification: "33.3 Armatur\n\nUNDERPOST\n33.3.6 UC1\nInnendørs stengeventiler\nAndre krav: Nei\n\nUNDERPOST\n33.3.6.3 DN 65 til kapasitetsmåler uten overvåking\nAntall stk 2"
} };
test("the DN65 capacity-meter isolation valves inherit the parent product, and do not require monitoring", () => {
  assert.equal(ahlsellRequirementIntent(shutoff), "shutoff_valve");
  const guide = buildAhlsellRequirementGuide(shutoff);
  assert.ok(guide.criteria.includes("Utan övervakning"));
  assert.ok(!guide.criteria.includes("Övervakad öppen"));
  assert.match(guide.searchQueries.join(" "), /Stengeventil DN65 uten overvåking/);
  const [monitored] = rankAhlsellCandidates(shutoff, [candidate("Spjeldventil DN65 åpen overvåking")]);
  assert.equal(ahlsellCandidateMatchState(monitored), "mismatch");
  const [unmonitored] = rankAhlsellCandidates(shutoff, [candidate("Spjeldventil DN65 uten overvåking m/håndtak")]);
  assert.doesNotMatch(warnings(unmonitored), /övervak|övervakning/i);
  assert.ok(findMldlOnlyCandidates(shutoff).length > 0);
});

const meter = { category: "control", value_text: "DN65", value_json: {
  postNumber: "33.3.7.1", parentPostNumber: "33.3.7", quantity: 1, unit: "st", attributes: { dimensjon: "DN65", måleområde: "300 - 3000 l/min" },
  technicalSpecification: "33.3 Armatur\n\nUNDERPOST\n33.3.7 KAPASITETSMÅLER\nStrømningsmåler for full vannmengdekontroll av typen LPCB Fire Sprinkler flowmeter DS1162 (GAP-meter) eller likeverdig.\nMåleområde: 300 - 3000 l/min\n\nUNDERPOST\n33.3.7.1 DN65 stk 1"
} };
test("a DN-only capacity meter inherits its own heading and checks the full specified flow range", () => {
  assert.equal(ahlsellRequirementIntent(meter), "flow_meter");
  assert.ok(buildAhlsellRequirementGuide(meter).searchQueries.includes("DS1162"));
  for (const name of ["Flow Switch VSR-2 DN65", "Vannmåler DN65", "Spjeldventil DN65"]) {
    const [result] = rankAhlsellCandidates(meter, [candidate(name)]);
    assert.equal(ahlsellCandidateMatchState(result), "mismatch", name);
  }
  const [shortRange] = rankAhlsellCandidates(meter, [candidate("Flowmeter DN65 150–2500 dm³/min")]);
  assert.equal(ahlsellCandidateMatchState(shortRange), "mismatch");
  assert.match(warnings(shortRange), /Fel mätområde.*300–3000/);
  const [fullRange] = rankAhlsellCandidates(meter, [candidate("Flowmeter DN65 300–3000 l/min")]);
  assert.equal(ahlsellCandidateMatchState(fullRange), "review");
  assert.match(warnings(fullRange), /sprinklergodkännande/);
  assert.equal(ahlsellRequirementIntent({ ...meter, value_json: { ...meter.value_json, parentPostNumber: "33.3.8" } }), "generic");
});

test("a water-supply pressure switch is not automatically verified as an alarm pressostat", () => {
  const req = { category: "valve", value_text: "TRYKKBRYTER FOR OVERVÅKING AV VANNTRYKK PÅ VANNFORSYNING. Monteres på vanninnlegg før innvendig hovedstengeventil til sprinkleranlegget." };
  assert.equal(ahlsellRequirementIntent(req), "pressure_switch");
  assert.doesNotMatch(buildAhlsellRequirementGuide(req).searchQueries.join(" "), /PS10/);
  const [result] = rankAhlsellCandidates(req, [candidate("Pressostat PS10-2")]);
  assert.equal(ahlsellCandidateMatchState(result), "review");
  assert.match(warnings(result), /inställningsområde.*larmgränser/);
  assert.deepEqual(complementMldlCandidates(req, [], [candidate("Spjeldventil DN65", "test-valve"), candidate("Skilt for trykkbryter", "test-sign")]), []);
});

test("automatic Ahlsell search can retrieve a pipe outside MLDL and excludes fittings before page reads", async () => {
  const article = "test-pipe-dn25";
  const pipe = candidate("Stålrør DN25 PN16 rillet", article);
  const queries: string[] = [];
  const details: string[] = [];
  const result = await findAhlsellHybridCandidates(pipes[0], async input => {
    const url = new URL(String(input));
    if (url.pathname.startsWith("/products/")) {
      details.push(url.pathname);
      assert.ok(url.pathname.includes(article), "Do not fetch end-cap or wrong-dimension details");
      return new Response(`<h1 data-test="product-name">Stålrør</h1><div>${pipe.productName}</div><span class="text-card-item-number"><span>${article}</span></span>`, { headers: { "Content-Type": "text/html" } });
    }
    queries.push(url.searchParams.get("parameters.SearchPhrase")!);
    return Response.json({ productCount: 2, productCards: [pipe, candidate("Endelokk DN25", "test-cap")].map(item => ({
      name: item.productName, mostRelevantVariantId: item.articleNumber, firstVariationPageUrl: item.productUrl, brand: item.manufacturer
    })) });
  });
  assert.ok(queries.some(query => /33\.7|DN25/.test(query)));
  assert.equal(details.length, 1);
  assert.deepEqual(result.candidates.map(item => item.articleNumber), [article]);
  assert.equal(ahlsellCandidateMatchState(result.candidates[0]), "review");
});
