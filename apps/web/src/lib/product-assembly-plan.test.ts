import assert from "node:assert/strict";
import test from "node:test";
import { assemblyComponentSearch, isAssemblyComponentCandidate, productAssemblyPlan } from "./product-assembly-plan";
import { newRequirementReview, productRequirementChecks, requirementReviewConfirmation, reviewProducts, validateRequirementReview } from "./product-requirement-review";

const req = { category: "valve", value_text: "INNENDØRS VANNLEDNING I VARERØR (RØR I RØR) – FORDELINGSSKAP", value_json: {
  quantity: 14, unit: "st", postNumber: "31.4.5", attributes: {
    "Antall utganger": "5 Kv og 4 Vv", "Dimensjon tilførsel": "15", Trykk: "PN6", Drenering: "Ja",
    "Stengeventil på hver utgang": "Valgfritt", "Stengeventil på tilførsel": "Valgfritt", "Materiale skap": "Valgfritt"
  }, sourceText: "Posten gjelder fordelerskap for tappevann. Eksisterende kobberrør skal tilknyttes fordelerskap og nye PEX rør i rør føringer skal legges fra skap til utstyr."
} };

test("cabinet is the main product; outlets, drainage and described pipe work are separate components", () => {
  const plan = productAssemblyPlan(req)!;
  assert.equal(plan.mainLabel, "Fördelarskåp för tappvatten");
  assert.deepEqual(plan.components.map(component => component.id), ["cold-water", "hot-water", "drainage", "connections", "pipe-runs", "valves"]);
  assert.equal(plan.components[0].searchTerm, "Fordeler 5 uttak");
  assert.equal(plan.components[1].searchTerm, "Fordeler 4 uttak");
  assert.equal(plan.components.at(-1)?.optional, true);
  assert.ok(plan.components.slice(0, -1).every(component => !component.optional));
  assert.ok(!plan.components.some(component => /PN6|material/i.test(component.label)));
  assert.ok(plan.components.every(component => !/14|DN15/.test(component.searchTerm)));
  assert.match(plan.components.find(component => component.id === "pipe-runs")!.requirement, /ritning/);
});

test("search uses the chosen product system without sending project or PDF prose", () => {
  const part = productAssemblyPlan(req)!.components[0];
  assert.equal(assemblyComponentSearch(part, "Fordelerskap Sanipex PRIVATE_PROJECT"), "Fordeler 5 uttak Sanipex");
  assert.equal(assemblyComponentSearch(part, "Fordelerskap Uponor"), "Fordeler 5 uttak Uponor");
  assert.equal(assemblyComponentSearch(part, "Fordelerskap LK"), "Fordeler 5 uttak LK Pex");
  assert.equal(assemblyComponentSearch(part, "Okänd tillverkare"), "Fordeler 5 uttak");
});

test("accessory groups reject cabinets, unrelated parts and application-only keyword matches", () => {
  for (const [kind, name, expected] of [
    ["manifold", "16 mm fordeler 5 Sanipex", true],
    ["manifold", "Fordeler med kuleventil", true],
    ["manifold", "Fordeler for fordelerskap", true],
    ["manifold", "Kuleventil for fordeler", false],
    ["manifold", "Fordelerskap med fordeler", false],
    ["manifold", "Holder til fordeler", false],
    ["drainage", "Avløpsbend til fordelerskap", true],
    ["drainage", "Fordelerskap med drenering", false],
    ["drainage", "Skilt drenering", false],
    ["connection", "Overgang kobber PEX Sanipex", true],
    ["pipe", "16mm PEX rør i rør Sanipex", true],
    ["pipe", "Kobling for PEX rør", false],
    ["pipe", "Fordelerskap LK Pex", false],
    ["valve", "Kuleventil for fordeler", true],
    ["valve", "Spjeldventil sprinkler", false]
  ] as const) assert.equal(isAssemblyComponentCandidate(kind, name), expected, name);
});

test("does not invent copper or PEX runs without the additional requirements and retains same-post continuations", () => {
  const minimal = { ...req, value_json: { ...req.value_json, sourceText: "" } };
  assert.deepEqual(productAssemblyPlan(minimal)!.components.map(part => part.id), ["cold-water", "hot-water", "drainage", "valves"]);
  assert.ok(productAssemblyPlan({ ...minimal, source_excerpt: "FORTSETTELSE SIDE 18\nNye PEX rør i rør." })!.components.some(part => part.id === "pipe-runs"));
  assert.equal(productAssemblyPlan({ value_text: "Kuleventil for fordelerskap DN15" }), null);
});

test("a required valve is not marked optional when another valve field is optional", () => {
  const plan = productAssemblyPlan({ ...req, value_json: { ...req.value_json, attributes: {
    ...req.value_json.attributes, "Stengeventil på tilførsel": "Ja"
  } } })!;
  assert.equal(plan.components.find(part => part.id === "valves")?.optional, false);
});

test("explicitly excluded drainage and valves do not become accessory purchases", () => {
  const plan = productAssemblyPlan({ ...req, value_json: { ...req.value_json, attributes: {
    ...req.value_json.attributes, Drenering: "Nei.", "Stengeventil på tilførsel": "Nei", "Stengeventil på hver utgang": "Nei"
  } } })!;
  assert.ok(plan.components.every(part => part.kind !== "valve" && part.kind !== "drainage"));
});

test("parts may be covered by the main package, while optional valves may be omitted with a recorded reason", () => {
  const selection = { productNumber: "5113213", accessories: [] };
  const products = reviewProducts(selection);
  const review = newRequirementReview(req);
  for (const check of productRequirementChecks(req)) review.decisions[check.id] = {
    status: check.optional ? "not_applicable" : "product", productKeys: check.optional ? [] : [products[0].key],
    note: check.optional ? "Valfritt enligt PDF." : "Ingår i huvudproduktens leverans enligt kontrollerat produktunderlag."
  };
  review.confirmation = requirementReviewConfirmation(review, products);
  assert.ok("data" in validateRequirementReview(req, selection, review));
  review.decisions["assembly:cold-water"] = { status: "pending", productKeys: [], note: "" };
  review.confirmation = requirementReviewConfirmation(review, products);
  assert.match((validateRequirementReview(req, selection, review) as { error: string }).error, /Kallvattenfördelare/);
});


// Real shape of the existing Lunde 2 extraction, including its old fitting category.
const pipeRequirement = (dn = 25) => ({ category: "fitting", value_text: `DN ${dn} komplett med deler bend, albuer, t- stykker,endebunn og oppheng`, value_json: {
  postNumber: dn === 25 ? "33.2.2.1" : "33.2.2.2", nsCode: "UB1.31114312099", unit: "m", quantity: dn === 25 ? 303 : 68,
  attributes: { dimensjon: `DN${dn}`, materiale: "Stål", trykk: "PN 16", skjøt: "Gjenget eller rilleskjøt" },
  technicalSpecification: "INNENDØRS RØRLEDNING - BRANNSLOKKING - KOMPLETT"
} });

test("DN25 and DN32 complete pipe lengths keep the pipe first and named parts separate", () => {
  for (const dn of [25, 32]) {
    const req = pipeRequirement(dn);
    const plan = productAssemblyPlan(req)!;
    assert.equal(plan.kind, "pipe");
    assert.equal(plan.mainLabel, `Rör DN${dn}`);
    assert.deepEqual(plan.components.map(p => p.id), ["bends", "tees", "caps", "supports", "joints"]);
    assert.ok(plan.components.every(p => p.quantityFromDrawing && !p.optional && p.searchTerm.includes(`DN${dn}`)));
    assert.ok(plan.components.every(p => !/303|68|90|45/.test(p.searchTerm)));
    const checks = productRequirementChecks(req);
    assert.equal(checks.filter(c => c.id === "component:caps").length, 1);
    assert.ok(!checks.some(c => c.id === "assembly:caps"));
    assert.match(checks.find(c => c.id === "component:tees")!.text, /Alla anslutningsdimensioner/);
  }
});

test("component search follows the chosen pipe connection without inventing a joint or angle", () => {
  const plan = productAssemblyPlan(pipeRequirement())!;
  const cap = plan.components.find(p => p.kind === "cap")!;
  assert.equal(assemblyComponentSearch(cap, "Stålrør DN25 gjenget PN16"), "Endelokk DN25 gjenget");
  assert.equal(assemblyComponentSearch(cap, "Stålrør DN25 rillet PN16"), "Endelokk DN25 rillet");
  assert.equal(assemblyComponentSearch(cap, "Stålrør DN25"), "Endelokk DN25");
  assert.equal(assemblyComponentSearch(plan.components.find(p => p.kind === "support")!, "Stålrør DN25 rillet"), "Rørklammer DN25");
});

test("standalone fittings and neighbouring text do not become pipe assembly plans", () => {
  assert.equal(productAssemblyPlan({ ...pipeRequirement(), value_text: "Endelokk DN25" }), null);
  assert.equal(productAssemblyPlan({ ...pipeRequirement(), value_text: "Bend DN25" }), null);
  assert.equal(productAssemblyPlan({ ...pipeRequirement(), value_text: "Stålrør DN25", value_json: { ...pipeRequirement().value_json, technicalSpecification: pipeRequirement().value_text } }), null);
});

test("pipe part roles allow sprinkler fittings but reject pipes and signage", () => {
  for (const [kind, good] of [["bend", "Bend DN25 FireLock"], ["tee", "T-rør DN25"], ["cap", "Endelokk DN25"], ["coupling", "Rillekobling DN25"], ["support", "Rørklammer DN25"]] as const) {
    assert.equal(isAssemblyComponentCandidate(kind, good), true, good);
    assert.equal(isAssemblyComponentCandidate(kind, "Stålrør DN25"), false);
    assert.equal(isAssemblyComponentCandidate(kind, `Skilt ${good}`), false);
  }
});
