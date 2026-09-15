import assert from "node:assert/strict";
import test from "node:test";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { findAhlsellMldlCandidates } from "./ahlsell-mldl-catalog";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";
import { engineeringRequirementWarnings } from "./ahlsell-engineering-checks";
import { verifiedVictaulicWorkingPressure } from "./victaulic-working-pressure";
import { productRequirementCategory } from "./product-requirement-category";

function requirement(attributes: Record<string, string> = {}) {
  return { category: "sprinkler_head", value_text: "SPRINKLER", value_json: { attributes: {
    sprinkleranlegg: "Våtanlegg", "type sprinkler": "Spraysprinkler", plassering: "Horisontalt på vegg",
    følsomhetsgrad: "Kvikk respons", utløsningstemperatur: "68 °C", "k-faktor": "80",
    "gjengedimensjon (dn)": "15", overflatebehandling: "Hvit", trykk: "12 bar", ...attributes
  } } };
}

function candidate(articleNumber: string, productName: string, specifications: string[] = []): AhlsellPublicCandidate {
  return { articleNumber, productName, manufacturer: "Victaulic", specifications,
    productUrl: `https://www.ahlsell.no/products/${articleNumber}/`, source: "catalog_search" };
}

test("pipe subposts keep the inherited NS family despite OCR heading errors and included supports", () => {
  const result = extractTechnicalDescriptionFromPages([{ pageNumber: 1, method: "ocr", confidence: .9, text: `30 VVS-installasjoner
30.332.7 UB1.31114399900
INNENDØRS RGRLEDNING - BRANNSLOKKING - KOMPLETT
Materiale: Stål
Dimensjon: Se under
30.332.7.1 DN25, ink. deler og oppheng
Lengde m 126
30.332.7.2 DN32, ink. deler og oppheng
Lengde m 384` }]);
  assert.deepEqual(result.materialLines.map(line => [line.postNumber, line.category, line.quantity]), [
    ["30.332.7.1", "pipe", 126], ["30.332.7.2", "pipe", 384]
  ]);
  // Previously uploaded rows still carry support; the inherited code must also
  // correct search and matching without rewriting user-approved selections.
  const stale = { category: "support", value_text: "DN25, ink. deler og oppheng", value_json: {
    postNumber: "30.332.7.1", nsCode: "UB1.31114399900", attributes: { dimensjon: "DN25" }
  } };
  const guide = buildAhlsellRequirementGuide(stale);
  assert.equal(productRequirementCategory(stale), "pipe");
  assert.ok(guide.criteria.includes("Sprinklerrör"), guide.criteria.join(" "));
  assert.ok(guide.searchQueries.every(query => !/oppheng|klammer/i.test(query)));
  assert.ok(findAhlsellMldlCandidates(stale).every(c => !/oppheng|klammer/i.test(c.productName)));
});

test("open foam and spray nozzles cannot outrank automatic sidewall sprinklers", () => {
  const good = candidate("9254065", '1/2" V2710 Sprinklerhode K80 HSW 68C QR hvit', ["standard coverage", "standard automatic sprinkler"]);
  const ranked = rankAhlsellCandidates(requirement(), [
    candidate("9254745", "Sprinklerdyse Modell V2603 Open Foam Nozzle QR Victaulic", ["K80"]),
    candidate("9254741", "Sprinklerhode Modell V12 Open Spray Victaulic", ["K80"]),
    good
  ]);
  assert.equal(ranked[0].articleNumber, good.articleNumber);
  for (const nozzle of ranked.slice(1)) {
    assert.equal(nozzle.recommendation, "unlikely");
    assert.ok(nozzle.matchScore! <= 34);
    assert.match(nozzle.matchWarnings!.join(" "), /öppen dysa/);
    assert.equal(nozzle.exactMatch, false);
  }
});

test("missing fields do not make a sparse catalogue result preferable to documented data", () => {
  const ranked = rankAhlsellCandidates(requirement(), [
    candidate("sparse", "Sprinklerhode", []),
    candidate("9254065", '1/2" V2710 sprinklerhode K80 HSW 68C QR hvit', ["standard coverage"])
  ]);
  assert.equal(ranked[0].articleNumber, "9254065");
  assert.match(ranked[1].matchWarnings!.join(" "), /K-faktorn saknas/);
  assert.match(ranked[1].matchWarnings!.join(" "), /Utlösningstemperaturen saknas/);
  assert.match(ranked[1].matchWarnings!.join(" "), /monteringsriktning saknas/);
});

test("sparse live cards use exact article evidence and preserve conflicting variant values", () => {
  const req = requirement();
  const ranked = rankAhlsellCandidates(req, [
    candidate("9254159N5", "Sprinklerhoder Modell V2710 QR Victaulic FireLock - Horisontal"),
    candidate("9254065", "Sprinklerhoder Modell V2710 QR Victaulic FireLock - Horisontal")
  ]);
  assert.equal(ranked[0].articleNumber, "9254065");
  assert.ok(!ranked[0].matchWarnings?.some(w => /saknas|arbetstryck/.test(w)));
  assert.match(ranked[1].matchWarnings!.join(" "), /temperatur|ytfinish/i);
  assert.equal(ranked[1].recommendation, "unlikely");
  const merged = mergeAhlsellCandidates(buildAhlsellRequirementGuide(req).directCandidates, ranked);
  assert.equal(merged[0].articleNumber, "9254065");
  assert.ok(!merged[0].matchWarnings?.some(w => /saknas|arbetstryck/.test(w)));
  // Even if a public card incorrectly says 68 C, the known 79 C article
  // must not pass. Conversely a public 79 C claim cannot disappear on merge.
  for (const product of [candidate("9254159N5", "V2710 K80 DN15 HSW 68C QR hvit"),
    candidate("9254065", "V2710 K80 DN15 HSW 79C QR hvit")]) {
    const [conflicting] = rankAhlsellCandidates(req, [product]);
    assert.equal(conflicting.exactMatch, false);
    assert.equal(conflicting.recommendation, "unlikely");
    assert.match(conflicting.matchWarnings!.join(" "), /temperatur/i);
  }
});

test("extended K161 selects K160 evidence ahead of an incompatible K115 catalogue bonus", () => {
  const req = requirement({ "type sprinkler": "Sprinkler med utvidet dekningsareal", "k-faktor": "161",
    "gjengedimensjon (dn)": "20", plassering: "Innfelt, synlig montasje i tak",
    "dekkskive/pyntering (ved innfelling)": "Dobbel rosett" });
  const guide = buildAhlsellRequirementGuide(req);
  assert.ok(guide.searchQueries.some(query => query.includes("K160")));
  const candidates = mergeAhlsellCandidates(guide.directCandidates, findAhlsellMldlCandidates(req));
  assert.equal(candidates[0]?.articleNumber, "9254075");
  assert.ok(candidates.every(c => !/Fel K-faktor/.test(c.matchWarnings?.join(" ") ?? "")));
  const conflicting = rankAhlsellCandidates(req, [candidate("bad", "K115 DN20 Sprinklerhode 68C QR hvit pendent recessed", ["extended coverage"])])[0];
  const merged = mergeAhlsellCandidates([conflicting], [{ ...conflicting, matchScore: 100, exactMatch: true }]);
  assert.equal(merged[0].recommendation, "unlikely");
  assert.ok(merged[0].matchScore! <= 34);
});

test("institutional and corridor requirements never collapse into standard coverage", () => {
  for (const type of ["Institusjonssprinkler", "Institusjonssprinkler med utvidet dekning", "Spesial korridorsprinkler med utvidet dekning"]) {
    const req = requirement({ "type sprinkler": type });
    const [ranked] = rankAhlsellCandidates(req, [candidate("9254065", "V2710 K80 DN15 HSW 68C QR hvit", ["standard coverage", "Sprinklerhode"])]);
    assert.equal(ranked.recommendation, "unlikely", type);
    assert.match(ranked.matchWarnings!.join(" "), /Fel täcknings-/);
    assert.equal(buildAhlsellRequirementGuide(req).directCandidates.length, 0);
  }
});

test("12 bar is documented only for verified articles with an exact SIN in a cited pressure table", () => {
  for (const [article,model] of [["9257392","V2762"],["9254065","V2710"],["9254075","V3412"]]) {
    const product = candidate(article, `${model} sprinklerhode`);
    const evidence = verifiedVictaulicWorkingPressure(product);
    assert.equal(evidence?.bar, 12);
    assert.match(evidence!.sourceUrl, /^https:\/\/assets\.victaulic\.com\//);
    assert.deepEqual(engineeringRequirementWarnings(requirement(), product), []);
    assert.match(engineeringRequirementWarnings(requirement({trykk:"13 bar"}), product).join(" "), /För lågt arbetstryck/);
  }
  for (const product of [candidate("unknown","V2762 sprinklerhode"), candidate("9254064","V2708 sprinklerhode"),
    candidate("9257392","V9999 sprinklerhode"), { ...candidate("9257392","V2762 sprinklerhode"), source: "pdf_reference" as const }]) {
    assert.equal(verifiedVictaulicWorkingPressure(product), null);
    assert.match(engineeringRequirementWarnings(requirement(), product).join(" "), /behöver verifieras/);
  }
});

test("working pressure units are normalized without treating factory tests as working pressure", () => {
  for (const value of ["Max. working pressure: 1200 kPa", "Max arbetstryck: 1,2 MPa", "Working pressure: 175 psi"]) {
    assert.deepEqual(engineeringRequirementWarnings(requirement(), candidate("unknown","Sprinklerhode", [value])), [], value);
  }
  assert.match(engineeringRequirementWarnings(requirement(), candidate("unknown","Sprinklerhode", ["Factory hydrostatic test: 34 bar"])).join(" "), /behöver verifieras/);
  assert.match(engineeringRequirementWarnings(requirement(), candidate("9257392","V2762 sprinklerhode", ["Working pressure: 10 bar"])).join(" "), /För lågt arbetstryck/);
});

test("an explicit free choice of finish is not converted into a brass requirement", () => {
  const req = requirement({ overflatebehandling: "Valgfritt" });
  const candidates = rankAhlsellCandidates(req, [
    candidate("9254065", '1/2" V2710 sprinklerhode K80 HSW 68C QR hvit', ["standard coverage"]),
    candidate("9254157N5", '1/2" V2710 sprinklerhode K80 HSW 68C QR messing', ["standard coverage"])
  ]);
  assert.ok(candidates.every(c => !/ytfinish|färg/.test(c.matchWarnings?.join(" ") ?? "")));
  assert.ok(!buildAhlsellRequirementGuide(req).criteria.includes("Messing"));
});

test("technical values in a search URL cannot fill missing product evidence", () => {
  const product = { ...candidate("unknown", "Sprinklerhode"),
    productUrl: "https://www.ahlsell.no/search?parameters.SearchPhrase=K80%20DN15%2068C%20QR%20HSW" };
  const [ranked] = rankAhlsellCandidates(requirement(), [product]);
  assert.equal(ranked.exactMatch, false);
  assert.match(ranked.matchWarnings!.join(" "), /K-faktorn saknas/);
  assert.match(ranked.matchWarnings!.join(" "), /Utlösningstemperaturen saknas/);
});
