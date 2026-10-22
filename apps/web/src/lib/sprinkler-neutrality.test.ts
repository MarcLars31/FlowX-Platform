import assert from "node:assert/strict";
import test from "node:test";
import { hasSprinklerContext, hasSprinklerHeadEvidence } from "./sprinkler-requirement-context";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { suggestedAccessories } from "./ahlsell-accessory-suggestions";
import { productAssemblyPlan } from "./product-assembly-plan";
import { projectRequirementDataWarnings } from "./project-requirement-data-warnings";
import { automaticProjectDetails } from "./technical-description-project";
import { extractTechnicalDescriptionFromPages } from "../modules/technical-description-extractor/extractor";
import { extractTechnicalSpecificationFromPages } from "../modules/pdf-extractor/extractor";

const candidate = (name: string, articleNumber = "neutral-test"): AhlsellPublicCandidate => ({
  productName: name, articleNumber, manufacturer: "Test", source: "catalog_search",
  productUrl: `https://www.ahlsell.no/products/${articleNumber}`, specifications: []
});

test("ordinary product searches and labels do not introduce sprinkler terminology", () => {
  for (const description of ["Manometer", "Rør DN40", "Stålrør DN40", "Kapasitetsmåler", "Strømningsvakt",
    "Spjeldventil DN40", "Stengeventil DN40", "Kupling DN40", "Bend DN40", "T-rør DN40", "Vannmåler",
    "Røroppheng", "Nøkkelbryter", "Alarmgiver", "Fleksibelslange", "Beskyttelsesgitter", "Pumpe innendørs"]) {
    const requirement = { value_text: description, value_json: { attributes: {} } };
    const guide = buildAhlsellRequirementGuide(requirement);
    assert.equal(hasSprinklerContext(requirement), false, description);
    assert.doesNotMatch([...guide.searchQueries, ...guide.criteria, ...guide.warnings].join(" "), /sprinkl|Vic 705/i, description);
    assert.equal(guide.directCandidates.length, 0, description);
  }
  const pipe = buildAhlsellRequirementGuide({ value_text: "DN40", value_json: { unit: "m" } });
  assert.equal(pipe.searchQuery, "Rør DN40");
  assert.doesNotMatch(pipe.searchQueries.join(" "), /stål|48[.,]3|sprinkl/i);
});

test("a candidate mentioning sprinkler receives no manometer score bonus", () => {
  const requirement = { value_text: "Manometer" };
  const ordinary = rankAhlsellCandidates(requirement, [candidate("Manometer")])[0];
  const sprinkler = rankAhlsellCandidates(requirement, [candidate("Manometer til sprinkler")])[0];
  assert.equal(ordinary.matchScore, sprinkler.matchScore);
  assert.equal(ordinary.recommendation, sprinkler.recommendation);
  assert.deepEqual(ordinary.matchWarnings, sprinkler.matchWarnings);
});

test("stored categories, comments, chapters and neighbouring source blocks cannot activate sprinkler rules", () => {
  const requirement = { category: "sprinkler_head", value_text: "Ukjent komponent", value_json: {
    postNumber: "31.2.1", parentPostNumber: "31.2", parentDescription: "Vannforsyning",
    attributes: { "pdf-kommentar": "Välj sprinkler", kapittel: "Sprinkler", "generelle krav": "Sprinkleranlegg",
      "type sprinkler": "Spraysprinkler", "k-faktor": "560" },
    attributeSources: { "type sprinkler": { postNumber: "33.1" } },
    technicalSpecification: "33.1 SPRINKLER\nType sprinkler: Spraysprinkler\n\nUNDERPOST\n31.2.1 Ukjent komponent"
  } };
  assert.equal(hasSprinklerContext(requirement), false);
  assert.equal(hasSprinklerHeadEvidence(requirement), false);
  assert.equal(ahlsellRequirementIntent(requirement), "generic");
  assert.equal(buildAhlsellRequirementGuide(requirement).directCandidates.length, 0);
  assert.equal(productAssemblyPlan(requirement), null);
  assert.deepEqual(projectRequirementDataWarnings(requirement), []);
  assert.deepEqual(suggestedAccessories(requirement, candidate("Sprinkler med rosett", "1361933")), []);
});

test("K-factor and temperature alone do not identify a sprinkler head", () => {
  for (const description of ["Ventil", "Måleinstrument", "Ukjent komponent"]) {
    const requirement = { category: "sprinkler_head", value_text: description, value_json: {
      attributes: { "k-faktor": "560", utløsningstemperatur: "68 C", plassering: "Innfelt", beskyttelse: "Med guard" }
    } };
    assert.notEqual(ahlsellRequirementIntent(requirement), "sprinkler_head");
    const guide = buildAhlsellRequirementGuide(requirement);
    assert.doesNotMatch(guide.criteria.join(" "), /K560|Recessed|Pendent/);
    assert.deepEqual(projectRequirementDataWarnings(requirement), []);
    assert.equal(rankAhlsellCandidates(requirement, [candidate(description)])[0].requiresAccessoryReview, false);
  }
});

test("explicit source evidence retains sprinkler searches, validation and accessories", () => {
  const requirement = { value_text: "SPRINKLER", value_json: { attributes: {
    "type sprinkler": "Spraysprinkler", sprinkleranlegg: "Våtanlegg", "k-faktor": "560",
    plassering: "Hengende innfelt", "dekkskive": "Ja"
  } } };
  assert.equal(ahlsellRequirementIntent(requirement), "sprinkler_head");
  assert.ok(projectRequirementDataWarnings(requirement).length);
  assert.ok(productAssemblyPlan(requirement)?.components.some(part => part.kind === "escutcheon"));
  const ordinary = { value_text: "Manometer", value_json: { attributes: { systemtype: "Sprinkleranlegg" } } };
  assert.equal(buildAhlsellRequirementGuide(ordinary).searchQuery, "Manometer sprinkler");
  assert.equal(ahlsellRequirementIntent(ordinary), "manometer");
  assert.equal(hasSprinklerContext({ value_text: "Slange", value_json: { nsCode: "UB1.33114699900A" } }), true);
});

test("empty and explicitly excluded sprinkler fields do not activate the specialization", () => {
  for (const value of ["", "-", "Nei", "Ikke aktuelt"]) {
    const requirement = { value_text: "Ukjent komponent", value_json: {
      attributes: { "type sprinkler": value }, sourceText: `Type sprinkler: ${value}`
    } };
    assert.equal(hasSprinklerHeadEvidence(requirement), false, value);
    assert.equal(hasSprinklerContext(requirement), false, value);
    assert.equal(ahlsellRequirementIntent(requirement), "generic", value);
  }
  for (const description of ["Ingen sprinkler", "Not a sprinkler head", "Uten sprinkleranlegg"]) {
    assert.equal(hasSprinklerContext({ value_text: description }), false, description);
    assert.equal(hasSprinklerHeadEvidence({ value_text: description }), false, description);
  }
  assert.equal(hasSprinklerHeadEvidence({ value_text: "Sprinkler uten beskyttelse" }), true);
});

test("generic valve assembly keeps required connection parts without sprinkler classification", () => {
  const requirement = { value_text: "Spjeldventil DN50", value_json: { sourceText: "Leveres med motflenser, bolter og pakninger" } };
  const plan = productAssemblyPlan(requirement);
  assert.equal(plan?.kind, "valve");
  assert.equal(plan?.components.length, 2);
});

test("PDF extraction preserves unrelated technical fields and does not apply sprinkler K limits", () => {
  const result = extractTechnicalDescriptionFromPages([{ pageNumber: 1, method: "text", confidence: 0.98,
    text: "31.1.1 MÅLEINSTRUMENT\nAntall stk 2\nK-faktor: 560\nMåleområde: 0-100 l/min\nSpenning: 24 V\nBeskyttelse: IP65"
  }]);
  assert.equal(result.materialLines.length, 1);
  assert.notEqual(result.materialLines[0].category, "sprinkler_head");
  assert.equal(result.materialLines[0].attributes["måleområde"], "0-100 l/min");
  assert.equal(result.materialLines[0].attributes.spenning, "24 V");
  assert.ok(!result.warnings.some(warning => warning.code === "IMPLAUSIBLE_K_FACTOR"));
  assert.doesNotMatch(automaticProjectDetails({ fileName: "Vannforsyning.pdf" }).systemType, /sprinkl/i);
});

test("a sprinkler section cannot set the system of unrelated PDF pages or earlier rows", () => {
  const result = extractTechnicalSpecificationFromPages([
    { pageNumber: 1, text: "Sprinkleranlegg A10\nNFPA 13" },
    { pageNumber: 2, text: "31.100.1 Manometer DN15 stk 2\n31.100.2 Dyse K=560 stk 1\nSprinkleranlegg A10\n33.100.1 Sprinklerhode K80 stk 4" },
    { pageNumber: 3, text: "NS-EN 806\n31.200.1 Kobberrør DN20 m 10" }
  ]);
  const manometer = result.lineItems.find(item => item.postNumber === "31.100.1");
  const nozzle = result.lineItems.find(item => item.postNumber === "31.100.2");
  const head = result.lineItems.find(item => item.postNumber === "33.100.1");
  assert.ok(manometer && nozzle && head);
  assert.equal(manometer.system, undefined);
  assert.notEqual(nozzle.category, "sprinkler");
  assert.equal(head.category, "sprinkler");
  assert.equal(head.system, "Sprinkleranlegg A10");
  assert.equal(result.lineItems.find(item => item.postNumber === "31.200.1")?.system, undefined);
  assert.ok(result.standards.some(standard => /806/.test(standard.code)));
});
