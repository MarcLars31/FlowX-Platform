import assert from "node:assert/strict";
import test from "node:test";
import { assemblyComponentSearch, isAssemblyComponentCandidate, productAssemblyPlan } from "./product-assembly-plan";
import { assessAssemblyComponents } from "./assembly-component-matching";
import { lookupAssemblyComponents } from "./assembly-component-lookup";
import { productRequirementChecks } from "./product-requirement-review";
import type { AhlsellLookupProduct } from "./ahlsell-product-lookup";

import { assessAhlsellLookupCandidates } from "./ahlsell-hybrid-matching";

const hose = {
  category: "sprinkler_hose", value_text: "INNENDØRS RØRLEDNING - BRANNSLOKKING - SLANGE",
  value_json: {
    postNumber: "30.332.6", nsCode: "UB1.33114699900A", quantity: 132, unit: "st",
    attributes: { materiale: "Stål - rustfritt", dimensjon: "DN25", trykk: "12bar" }
  }
};
const hoseScope = 'Flexislanger skal være av typen "braided"-utførelse, samt at festemateriell inkluderes posten. Maksimalt ekvivalent lengde skal ikke overstige 15m.';

test("post 30.332.6 requires hose fastening independently of the chosen product's accessory suggestions", () => {
  for (const field of ["sourceText", "technicalSpecification"] as const) {
    const requirement = { ...hose, value_json: { ...hose.value_json, [field]: hoseScope } };
    const plan = productAssemblyPlan(requirement)!;
    assert.equal(plan.mainLabel, "Sprinklerslang");
    assert.deepEqual(plan.components.map(component => component.id), ["hose-support"]);
    assert.equal(plan.components[0].optional, false);
    assert.equal(plan.components[0].quantityNeedsReview, true);
  }
  assert.equal(productAssemblyPlan({ ...hose, source_excerpt: hoseScope })!.components[0]?.id, "hose-support");
});

test("structured hose requirements include both supplied fastening and suspended-ceiling mounting", () => {
  for (const attributes of [
    { "omfatter også": hoseScope },
    { montasje: "Festes i systemhimling." },
    { montasje: "Festes i\nsystemhimling." },
    { montasje: "Feste i himling" },
    { "omfatter også": "Leveres med tilhørende festeanordning for himling." }
  ]) {
    const requirement = { ...hose, value_json: { ...hose.value_json, attributes } };
    assert.deepEqual(productAssemblyPlan(requirement)!.components.map(component => component.id), ["hose-support"]);
  }
});

test("a hose without a fastening requirement or with explicitly excluded fastening gets no required accessory", () => {
  for (const attributes of [
    { plassering: "Over systemhimling" },
    { "omfatter også": "Flexislanger skal være av typen braided-utførelse." },
    { "omfatter også": "Leveres uten festemateriell." },
    { "omfatter også": "Festemateriell skal ikke inkluderes i denne posten." },
    { "omfatter også": "Festemateriell\nskal ikke inkluderes i denne posten." },
    { festemateriell: "Nei" }
  ]) {
    const requirement = { ...hose, value_json: { ...hose.value_json, attributes } };
    assert.deepEqual(productAssemblyPlan(requirement)!.components, []);
  }
});

const pipe = { category: "fitting", value_text: "DN 25 komplett med deler bend, albuer, t- stykker,endebunn og oppheng", value_json: {
  nsCode: "UB1.31114312099", unit: "m", quantity: 303, attributes: { dimensjon: "DN25", materiale: "Stål", trykk: "PN16", skjøt: "Gjenget eller rilleskjøt" }
} };
const wet = { category: "valve", value_text: "KONTROLLVENTILSETT FOR SPRINKLERANLEGG", value_json: {
  postNumber: "33.3.2", attributes: { "type kontrollventilsett": "Våt alarmventil", "dimensjon (dn)": "65", trykk: "12 bar" },
  sourceText: "Ventilen skal leveres med retardasjonskammer for trykkutgjevning."
} };
const head = { category: "sprinkler_head", value_text: "Sprinkler", value_json: { postNumber: "33.4.4", attributes: {
  plassering: "Innfelt, synlig montasje i tak", "dekkskive/pyntering (ved innfelling)": "Todelt rosett", beskyttelse: "Nei",
  "k faktor": "161", "gjengedimensjon (dn)": "20"
} } };
const product = (name: string, articleNumber = name): AhlsellLookupProduct => ({
  articleNumber, productName: name, productUrl: `https://www.ahlsell.no/products/test/${articleNumber}/`,
  manufacturer: "Test", specifications: [], source: "catalog_search", exactMatch: true
});

test("a web-only main hose with no bundled suggestions still offers the specified fastening", async () => {
  const requirement = { ...hose, value_json: { ...hose.value_json, attributes: { ...hose.value_json.attributes, "omfatter også": hoseScope } } };
  const mainArticle = "9999801", supportArticle = "9999802";
  const main = product("Sprinklerslange DN25 rustfritt 12 bar", mainArticle);
  const [selected] = assessAhlsellLookupCandidates(requirement, [main]);
  assert.equal(selected.suggestedAccessories?.length ?? 0, 0);
  const support = productAssemblyPlan(requirement)!.components.find(component => component.id === "hose-support");
  assert.ok(support, "the requirement must open the accessory step even without catalogue suggestions");
  const queries: string[] = [];
  const result = await lookupAssemblyComponents({ requirement, component: support, mainArticleNumber: selected.articleNumber,
    automatic: true, query: assemblyComponentSearch(support, selected.productName), market: "no", fetchImpl: async input => {
      const url = new URL(String(input));
      if (url.pathname.startsWith("/products/")) {
        const article = url.pathname.split("/").filter(Boolean).at(-1)!;
        const name = article === mainArticle ? main.productName : "Feste sprinklerslange for systemhimling";
        return new Response(`<h1 data-test="product-name">${name}</h1><span class="text-card-item-number"><span>${article}</span></span>`, { headers: { "Content-Type": "text/html" } });
      }
      const query = url.searchParams.get("parameters.SearchPhrase");
      if (!query) return Response.json({ productCards: [] });
      queries.push(query);
      const found = query === mainArticle ? [main] : [product("Feste sprinklerslange for systemhimling", supportArticle), main];
      return Response.json({ productCount: found.length, productCards: found.map(item => ({ name: item.productName,
        mostRelevantVariantId: item.articleNumber, firstVariationPageUrl: item.productUrl, brand: "Test" })) });
    }
  });
  assert.ok(queries.includes(mainArticle), "resolve the newly selected main product before checking accessories");
  assert.ok(queries.includes("Feste sprinklerslange"));
  assert.ok(result.products.some(item => item.articleNumber === supportArticle));
  assert.ok(result.products.every(item => item.articleNumber !== mainArticle));
  assert.ok(result.products.every(item => item.exactMatch === false), "accessories still need compatibility review");
});

test("wet valve set requires its retard chamber without duplicating separately quantified alarm and valve posts", () => {
  const plan = productAssemblyPlan(wet)!;
  assert.equal(plan.mainLabel, "Komplett vått alarmventilset");
  assert.deepEqual(plan.components.map(c => c.kind), ["retard_chamber"]);
  assert.equal(plan.components[0].quantityNeedsReview, true);
  assert.ok(productRequirementChecks(wet).some(check => check.label === "Retardationskammare"));
  const alarm = productAssemblyPlan({ category: "control", value_text: "ALARMGIVER komplett sett inkl. ekstra alarmgiver Type Tyco KIT5", value_json: {
    ...wet.value_json, postNumber: "33.3.2.1", quantity: 2
  } })!;
  assert.deepEqual(alarm.components.map(c => c.kind), ["alarm_device"]);
  assert.equal(alarm.components[0].quantityNeedsReview, true);
  assert.ok(!alarm.components.some(c => c.kind === "retard_chamber"));
});

test("sprinkler accessories obey mounting conditions and excluded protection, never inherit head K-factor or connection DN", () => {
  const plan = productAssemblyPlan(head)!;
  assert.deepEqual(plan.components.map(c => [c.kind, c.optional, c.conditional]), [["escutcheon", false, false]]);
  const rosette = plan.components[0];
  assert.equal(assemblyComponentSearch(rosette, "Victaulic V2762 DN20 K161 PRIVATE_PROJECT"), "Rosett sprinkler Victaulic V2762");
  const result = assessAssemblyComponents(head, rosette, [product("Rosett for V2762"), product("Rosett for V3408"), product("Sprinklerhode V2762 med rosett")], product("Sprinklerhode V2762 K161 DN20"));
  assert.deepEqual(result.map(c => c.productName), ["Rosett for V2762"]);
  assert.equal(result[0].exactMatch, false);
  assert.doesNotMatch(result[0].matchWarnings?.join(" ") ?? "", /K161|DN20|dimension saknas/);
  const exposed = { ...head, value_json: { ...head.value_json, attributes: { ...head.value_json.attributes, plassering: "Over himling" } } };
  assert.deepEqual(productAssemblyPlan(exposed)!.components, []);
  const conditional = { ...head, value_json: { ...head.value_json, attributes: { ...head.value_json.attributes, plassering: "Horisontalt på vegg" } } };
  assert.equal(productAssemblyPlan(conditional)!.components[0].conditional, true);
});

test("sprinkler part roles exclude unrelated products and supply-only accessory references", () => {
  for (const [kind, good, bad] of [
    ["retard_chamber", "Retardasjonskammer for S751", "Alarmventil med retardasjonskammer"],
    ["alarm_device", "Alarmpressostat for alarmventil", "Skilt alarmpressostat"],
    ["escutcheon", "Rosetter til sprinkler", "Sprinklerhode med rosett"],
    ["guard", "Sprinklergitter V27", "Pakningssett for sprinklergitter"]
  ] as const) {
    assert.equal(isAssemblyComponentCandidate(kind, good), true, good);
    assert.equal(isAssemblyComponentCandidate(kind, bad), false, bad);
  }
});

test("DN-only valves and capacity meters get main-product guidance without invented accessory quantities", () => {
  for (const [parent, heading, expected] of [["33.3.6", "UC1\nInnendørs stengeventiler", "Avstängningsventil"], ["33.3.7", "KAPASITETSMÅLER", "Kapacitetsmätare"]]) {
    const plan = productAssemblyPlan({ category: "control", value_text: "DN65", value_json: { parentPostNumber: parent, attributes: { dimensjon: "DN65" }, technicalSpecification: `${parent} ${heading}` } })!;
    assert.equal(plan.mainLabel, expected);
    assert.deepEqual(plan.components, []);
  }
});

test("pipe accessories use the chosen main joint, physical diameter and specified pressure class, keeping unknowns for review", () => {
  const cap = productAssemblyPlan(pipe)!.components.find(c => c.kind === "cap")!;
  const products = [
    product("Endelokk DN25 PN16 gjenget", "threaded"), product("Endelokk DN25 PN16 rillet", "grooved"),
    product("42.4mm endelokk PN16 rillet", "wrong-size"), product("Endelokk DN25 PN10 rillet", "low-pressure"),
    product("Endelokk DN25 PN25 rillet", "higher-pressure"), product("Endelokk DN25", "unknown")
  ];
  const grooved = assessAssemblyComponents(pipe, cap, products, product("Stålrør DN25 rillet"));
  assert.deepEqual(new Set(grooved.map(p => p.articleNumber)), new Set(["grooved", "unknown"]));
  const threaded = assessAssemblyComponents(pipe, cap, products, product("Stålrør DN25 gjenget"));
  assert.deepEqual(new Set(threaded.map(p => p.articleNumber)), new Set(["threaded", "unknown"]));
  assert.ok(grooved.every(p => !p.exactMatch));
});

test("IGS and OGS evidence cannot be treated as interchangeable; a product subtitle supplies missing part details", () => {
  const cap = productAssemblyPlan(pipe)!.components.find(c => c.kind === "cap")!;
  const result = assessAssemblyComponents(pipe, cap, [
    product("Endelokk DN25 PN16 rillet IGS", "igs"), product("Endelokk DN25 PN16 rillet OGS", "ogs"),
    { ...product("Rillede fittings", "subtitle"), subtitle: "33.7mm endelokk IGS PN16 rillet" }
  ], product("Stålrør DN25 rillet IGS"));
  assert.deepEqual(new Set(result.map(p => p.articleNumber)), new Set(["igs", "subtitle"]));
});

test("automatic component lookup resolves the selected NRF and product pages before filtering, without sending client prose", async () => {
  const mainArticle = "9999701", rightArticle = "9999702", wrongArticle = "9999703";
  const products = [product("Endelokk DN25", rightArticle), product("Endelokk DN25", wrongArticle)];
  const queries: string[] = [];
  const details: string[] = [];
  const cap = productAssemblyPlan(pipe)!.components.find(c => c.kind === "cap")!;
  const result = await lookupAssemblyComponents({ requirement: pipe, component: cap, mainArticleNumber: mainArticle,
    automatic: true, query: "PRIVATE_PROJECT arbitrary client request", market: "no", fetchImpl: async input => {
      const url = new URL(String(input));
      if (url.pathname.startsWith("/products/")) {
        const article = url.pathname.split("/").filter(Boolean).at(-1)!;
        details.push(article);
        const name = article === mainArticle ? "Stålrør DN25 PN16 rillet" : article === rightArticle ? "Endelokk DN25 PN16 rillet" : "Endelokk DN25 PN16 gjenget";
        return new Response(`<h1 data-test="product-name">${article === mainArticle ? "Stålrør" : "Endelokk"}</h1><div>${name}</div><span class="text-card-item-number"><span>${article}</span></span>`, { headers: { "Content-Type": "text/html" } });
      }
      const query = url.searchParams.get("parameters.SearchPhrase");
      if (!query) return Response.json({ productCards: [] });
      queries.push(query);
      const found = query === mainArticle ? [product("Stålrør DN25", mainArticle)] : products;
      return Response.json({ productCount: found.length, productCards: found.map(p => ({ name: p.productName, mostRelevantVariantId: p.articleNumber, firstVariationPageUrl: p.productUrl, brand: "Test" })) });
    }
  });
  assert.ok(queries.includes(mainArticle));
  assert.ok(queries.includes("Endelokk DN25 rillet"));
  assert.ok(queries.every(q => !q.includes("PRIVATE_PROJECT")));
  assert.ok(details.includes(mainArticle) && details.includes(rightArticle) && details.includes(wrongArticle));
  assert.deepEqual(result.products.filter(p => p.articleNumber.startsWith("99997")).map(p => p.articleNumber), [rightArticle]);
  assert.ok(result.products.some(p => p.evidenceSources?.includes("mldl_database")), "compatible database parts share the web result list");
});

test("missing main-product evidence does not invent compatibility", () => {
  const cap = productAssemblyPlan(pipe)!.components.find(c => c.kind === "cap")!;
  const result = assessAssemblyComponents(pipe, cap, [product("Endelokk DN25 PN16")], null);
  assert.equal(result[0].exactMatch, false);
  assert.match(result[0].matchWarnings!.join(" "), /Huvudproduktens tekniska uppgifter kunde inte verifieras/);
});
