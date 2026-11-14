import assert from "node:assert/strict";
import test from "node:test";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { complementMldlCandidates } from "./ahlsell-hybrid-matching";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { isRigidPipeProduct } from "./pipe-product-family";
import { assessAssemblyComponents } from "./assembly-component-matching";
import { productAssemblyPlan } from "./product-assembly-plan";

const requirement = { category: "fitting", value_text: "DN 25 komplett med deler bend, albuer, t- stykker,endebunn og oppheng", value_json: {
  postNumber: "33.2.2.1", nsCode: "UB1.31114312099", unit: "m", quantity: 303,
  attributes: { dimensjon: "DN25", materiale: "Stål", trykk: "PN 16", skjøt: "Gjenget eller rilleskjøt" }
} };
const candidate = (name: string, articleNumber = name): AhlsellPublicCandidate => ({ articleNumber, productName: name, manufacturer: "Test",
  productUrl: `https://www.ahlsell.no/products/test/${articleNumber}`, specifications: [], source: "catalog_search", exactMatch: true, matchScore: 100, recommendation: "recommended" });

test("existing complete pipe rows override stale fitting, cap and valve categories", () => {
  for (const category of ["fitting", "cap", "valve", "pipe"]) {
    const req = { ...requirement, category };
    assert.equal(ahlsellRequirementIntent(req), "pipe");
    const queries = buildAhlsellRequirementGuide(req).searchQueries;
    assert.ok(queries.some(q => /DN25/.test(q)));
    assert.ok(queries.every(q => !/endelo|endebunn|bend|303/i.test(q)));
  }
});

test("main pipe proposals exclude fittings even with inherited perfect scores", () => {
  const names = ["Endelokk for stålrør DN25", "Bend av stålrør DN25", "T-rør DN25", "Y-rør rillet DN25", "Rørklammer DN25", "Kupling for rør DN25", "Muffe for rør DN25", "Sprinklerslange DN25", "Skilt stålrør DN25"];
  for (const name of names) assert.equal(isRigidPipeProduct(name), false, name);
  assert.equal(isRigidPipeProduct("Stålrør DN25 gjenget med muffe"), true);
  const pipe = candidate("Stålrør DN25 gjenget PN16", "9999901");
  const all = [...names.map((name, i) => candidate(name, `99999${i + 10}`)), pipe];
  const result = complementMldlCandidates(requirement, all, all);
  assert.deepEqual(result.map(c => c.articleNumber), [pipe.articleNumber]);
  assert.equal(result[0].exactMatch, false);
  assert.match(result[0].matchWarnings?.join(" ") ?? "", /hela posten/);
});

test("explicit threaded OR grooved accepts either main pipe but still rejects welded joints", () => {
  const products = ["gjenget", "rillet", "sveist"].map(joint => candidate(`Stålrør DN25 PN16 ${joint}`, joint));
  const ranked = rankAhlsellCandidates(requirement, products);
  for (const joint of ["gjenget", "rillet"]) assert.ok(!ranked.find(p => p.articleNumber === joint)?.matchWarnings?.some(w => /skarv|anslutning/i.test(w)), joint);
  assert.ok(ranked.find(p => p.articleNumber === "sveist")?.matchWarnings?.some(w => /skarv|anslutning/i.test(w)));
  const threadedOnly = { ...requirement, value_json: { ...requirement.value_json, attributes: { ...requirement.value_json.attributes, skjøt: "Gjenget" } } };
  assert.ok(rankAhlsellCandidates(threadedOnly, [products[1]])[0].matchWarnings?.some(w => /skarv|anslutning/i.test(w)));
});

test("pipe accessory assessment uses its own family and dimension without inheriting steel pipe material", () => {
  const cap = productAssemblyPlan(requirement)!.components.find(c => c.kind === "cap")!;
  const result = assessAssemblyComponents(requirement, cap, [
    candidate("Endelokk DN25 PN16 duktilt støpejern", "9999901"),
    candidate("Endelokk DN32 PN16", "9999902"), candidate("Stålrør DN25 PN16", "9999903")
  ]);
  assert.deepEqual(result.map(c => c.articleNumber), ["9999901"]);
  assert.equal(result[0].exactMatch, false);
  assert.ok(!result[0].matchWarnings?.some(w => /Fel material/.test(w)));
  assert.match(result[0].matchWarnings?.join(" ") ?? "", /ritningen/);
});
