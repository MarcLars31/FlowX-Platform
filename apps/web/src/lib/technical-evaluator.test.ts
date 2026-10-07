import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTechnicalRequirements } from "./technical-evaluator";
import { resolveEffectiveRequirements, requirementForSearch, withEffectiveRequirements } from "./effective-requirements";
import { technicalRevision, type EffectiveRequirement, type EffectiveRequirementSet, type ProductObservation } from "./technical-evaluation-model";
import { evaluateAhlsellCandidates } from "./ahlsell-technical-evaluator";
import { buildAhlsellTechnicalEvidence, mergeAhlsellTechnicalEvidence } from "./ahlsell-technical-evidence";
import { ahlsellCandidateMatchState, isMatchingAhlsellCandidate } from "./ahlsell-candidate-ranking";
import { classifyAhlsellCatalogCandidates, splitAhlsellMatchGroups } from "./ahlsell-match-groups";
import { candidateSelectionReview } from "./product-selection-review";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

const now = new Date("2026-10-07T15:00:00Z");
const requirement = (property: string, value: EffectiveRequirement["value"], options: Partial<EffectiveRequirement> = {}): EffectiveRequirement => ({
  id: `${property}:${JSON.stringify(value)}`, property, value, label: property, operator: "eq", mandatory: true,
  source: { kind: "post", raw: `${property}: ${value}`, postNumber: "1.1", page: 1 }, ...options
});
const set = (...requirements: EffectiveRequirement[]): EffectiveRequirementSet => ({ version: 1, revision: technicalRevision(requirements), requirements });
const observation = (property: string, value: ProductObservation["value"], options: Partial<ProductObservation> = {}): ProductObservation => ({
  property, value, productId: "A", source: "manufacturer:sheet:v1", raw: String(value), documented: true, ...options
});
const evaluate = (requirements: EffectiveRequirement[], observations: ProductObservation[]) => evaluateTechnicalRequirements(set(...requirements), "A", observations, now);

test("mandatory failure wins over matches and missing information; optional failure does not", () => {
  const requirements = [requirement("dn", 20), requirement("finish", "white"), requirement("power", 100)];
  assert.equal(evaluate(requirements, [observation("dn", 15), observation("finish", "white")]).status, "FAIL");
  assert.equal(evaluate([requirement("dn", 20), requirement("finish", "white", { mandatory: false })], [observation("dn", 20), observation("finish", "black")]).status, "MATCH");
});

test("missing data, no requirements, unknown operators and malformed numeric values never pass", () => {
  assert.equal(evaluate([requirement("dn", 20)], []).status, "VERIFY");
  assert.equal(evaluate([], [observation("dn", 20)]).status, "VERIFY");
  assert.equal(evaluate([requirement("dn", Number.NaN)], [observation("dn", 20)]).status, "VERIFY");
  assert.equal(evaluate([requirement("dn", 20, { operator: "unknown" as "eq" })], [observation("dn", 20)]).status, "VERIFY");
});

test("converts compatible units and keeps DN, diameter and pressure classes distinct", () => {
  assert.equal(evaluate([requirement("workingPressureBar", 12, { operator: "gte", unit: "bar" })], [observation("workingPressureBar", 1.6, { unit: "mpa" })]).status, "MATCH");
  assert.equal(evaluate([requirement("width", 1200, { unit: "mm" })], [observation("width", 1.2, { unit: "m" })]).status, "MATCH");
  assert.equal(evaluate([requirement("dn", 20)], [observation("outsideDiameterMm", 20, { unit: "mm" })]).status, "VERIFY");
  assert.equal(evaluate([requirement("workingPressureBar", 12, { unit: "bar" })], [observation("pn", 16)]).status, "VERIFY");
  assert.equal(evaluate([requirement("width", 1200, { unit: "mm" })], [observation("width", 1200)]).status, "VERIFY");
});

test("uses the same generic operators for doors, electrical equipment and boolean capabilities", () => {
  const requirements = [requirement("fireRating", "ei60"), requirement("width", [900, 1200], { operator: "range", unit: "mm" }),
    requirement("voltage", [230, 400], { operator: "one_of", unit: "V" }), requirement("reversible", false)];
  const observations = [observation("fireRating", "EI60"), observation("width", 100, { unit: "cm" }),
    observation("voltage", 230, { unit: "V" }), observation("reversible", false)];
  assert.equal(evaluate(requirements, observations).status, "MATCH");
  assert.equal(evaluate([requirement("width", [900, 1200], { operator: "range", unit: "mm" })], [observation("width", 1300, { unit: "mm" })]).status, "FAIL");
});

test("conflicting constraints and conflicting evidence require verification", () => {
  const incompatible = [requirement("dn", 20), requirement("dn", 25, { source: { kind: "project", raw: "DN25" } })];
  assert.equal(evaluate(incompatible, [observation("dn", 20)]).status, "VERIFY");
  assert.equal(evaluate([requirement("power", 200, { operator: "gte" }), requirement("power", 100, { operator: "lte" })], [observation("power", 150)]).status, "VERIFY");
  assert.equal(evaluate([requirement("dn", 20)], [observation("dn", 20), observation("dn", 25)]).status, "VERIFY");
});

test("wrong identity, expired, future-dated, inferred and conditional evidence cannot approve", () => {
  for (const overrides of [{ productId: "B" }, { expiresAt: "2026-10-06" }, { observedAt: "2027-01-01" },
    { observedAt: "invalid" }, { documented: false }, { source: "" }, { conditions: ["only at 20°C"] }]) {
    assert.equal(evaluate([requirement("dn", 20)], [observation("dn", 20, overrides)]).status, "VERIFY", JSON.stringify(overrides));
  }
});

test("resolves post, inherited and project requirements with provenance, preserving the original", () => {
  const row = { id: "row", source_page: 7, value_text: "Rør", value_json: { postNumber: "1.1.1", parentPostNumber: "1.1", parentDescription: "Rør", attributes: {
    materiale: "Stål", "dimensjon (dn)": "20", finish: "Valgfritt"
  }, attributeSources: { materiale: { postNumber: "1.1", sourcePage: 5 }, "dimensjon (dn)": { postNumber: "1.1.1", sourcePage: 7 } } } };
  const before = JSON.stringify(row);
  const resolved = withEffectiveRequirements(row, { arbeidstrykk: "minimum 1,2 MPa" });
  assert.equal(JSON.stringify(row), before);
  const fields = resolved.effectiveRequirements.requirements;
  assert.equal(fields.length, 3);
  assert.equal(fields.find(item => item.property === "material")?.source.kind, "parent");
  assert.equal(fields.find(item => item.property === "material")?.source.page, 5);
  assert.equal(fields.find(item => item.property === "dn")?.source.kind, "post");
  assert.equal(fields.find(item => item.property === "workingPressureBar")?.value, 12);
  const search = requirementForSearch(resolved).value_json as { attributes: Record<string, string> };
  assert.equal(search.attributes.trykk, "12 bar");
  assert.equal(resolveEffectiveRequirements(row, { arbeidstrykk: "13 bar" }).revision === resolved.effectiveRequirements.revision, false);
});

test("unparsed additions, uncertain enum values and missing parent remain visible VERIFY requirements", () => {
  const resolved = resolveEffectiveRequirements({ value_text: "Rør", value_json: {
    parentPostNumber: "1.1", postNumber: "1.1.1", attributes: { materiale: "Stål eller tilsvarende" },
    technicalSpecification: "Andre krav:\nSkal leveres med spesialtilpasset støtte."
  } });
  assert.ok(resolved.requirements.some(item => item.property === "material" && item.issue));
  assert.ok(resolved.requirements.some(item => item.source.raw.includes("spesialtilpasset støtte")));
  assert.ok(resolved.requirements.some(item => item.label === "Hovedpost"));
  assert.equal(evaluateTechnicalRequirements(resolved, "A", [], now).status, "VERIFY");
});

const row = { value_text: "Sprinkler", value_json: { attributes: { "dimensjon (dn)": "15" } } };
function candidate(id: string, dn: number | null): AhlsellPublicCandidate {
  return { articleNumber: id, productName: "Sprinkler", manufacturer: "Example", productUrl: `https://www.ahlsell.no/products/${id}`,
    source: "catalog_search", specifications: [], matchScore: 100, exactMatch: true, recommendation: "recommended",
    technicalEvidence: buildAhlsellTechnicalEvidence({ articleNumber: id, sourceUrl: `https://www.ahlsell.no/products/${id}`,
      productName: "Sprinkler", subtitle: null, description: null, specifications: dn ? [`DN: ${dn}`] : [], retrievedAt: now.toISOString() }) };
}

test("search score and history cannot promote FAIL or VERIFY; technical rank precedes score", () => {
  const wrong = { ...candidate("wrong", 20), learningEvidence: { kind: "similar_confirmed" as const, supportCount: 1000, similarityScore: 100 } };
  const unknown = candidate("unknown", null);
  const right = { ...candidate("right", 15), matchScore: 1, exactMatch: false, recommendation: "possible" as const };
  const evaluated = evaluateAhlsellCandidates(row, [wrong, unknown, right], now);
  assert.deepEqual(evaluated.map(item => item.articleNumber), ["right", "unknown", "wrong"]);
  assert.deepEqual(evaluated.map(item => item.technicalEvaluation.status), ["MATCH", "VERIFY", "FAIL"]);
  assert.equal(isMatchingAhlsellCandidate(unknown), false);
  assert.equal(ahlsellCandidateMatchState(evaluated[2]), "mismatch");
  assert.equal(candidateSelectionReview(evaluated[2])?.status, "mismatch");
  assert.equal(classifyAhlsellCatalogCandidates([evaluated[2]]), "none");
  assert.equal(classifyAhlsellCatalogCandidates([evaluated[1]]), "found");
  assert.equal(classifyAhlsellCatalogCandidates([evaluated[0]]), "safe");
  assert.equal(isMatchingAhlsellCandidate({ ...evaluated[0], technicalEvaluation: { ...evaluated[0].technicalEvaluation, checks: [] } }), false);
  assert.equal(isMatchingAhlsellCandidate({ ...evaluated[0], technicalEvaluation: { ...evaluated[0].technicalEvaluation, checks: evaluated[2].technicalEvaluation.checks } }), false);
});

test("a historical fingerprint alone does not mark a post technically safe", () => {
  const historical = { id: "r", value_text: "Ukjent produkt", value_json: {}, mapping_fingerprint: "known" };
  const groups = splitAhlsellMatchGroups([historical], { approvedRequirementIds: new Set(), memoryFingerprints: new Set(["known"]) });
  assert.equal(groups.greenRequirements.length, 0);
  assert.equal(groups.yellowRequirements.length, 1);
});

test("generic properties survive exact-article extraction and evidence merges", () => {
  const evidence = buildAhlsellTechnicalEvidence({ articleNumber: "A", sourceUrl: "https://manufacturer.example/A", productName: "Dør",
    subtitle: null, description: null, specifications: ["Bredde: 90 cm", "Brannklasse: EI60", "Spenning: 230 V"], retrievedAt: now.toISOString() });
  const combined = mergeAhlsellTechnicalEvidence(evidence, evidence)!;
  assert.equal(combined.normalizedProperties?.length, 3);
  assert.equal(combined.normalizedProperties?.find(item => item.property === "width")?.value, 900);
  assert.equal(mergeAhlsellTechnicalEvidence(evidence, { ...evidence, articleNumber: "B", normalizedProperties: [{ ...evidence.normalizedProperties![0], value: 10 }] })?.normalizedProperties?.length, 3);
});

test("evaluation revisions change with product evidence and normalized requirements", () => {
  const initial = evaluate([requirement("dn", 20)], [observation("dn", 20)]);
  const changedEvidence = evaluate([requirement("dn", 20)], [observation("dn", 25)]);
  const changedRequirements = evaluate([requirement("dn", 25)], [observation("dn", 20)]);
  assert.notEqual(initial.evidenceRevision, changedEvidence.evidenceRevision);
  assert.notEqual(initial.requirementRevision, changedRequirements.requirementRevision);
  assert.equal(technicalRevision({ b: 2, a: 1 }), technicalRevision({ a: 1, b: 2 }));
});

test("multiple required approvals are cumulative, and absence from an incomplete list means VERIFY", () => {
  const requirements = [requirement("approval", "fm", { operator: "contains" }), requirement("approval", "ul", { operator: "contains" })];
  assert.equal(evaluate(requirements, [observation("approval", "FM"), observation("approval", "UL")]).status, "MATCH");
  assert.equal(evaluate(requirements, [observation("approval", "FM")]).status, "VERIFY");
});

test("pressure class is not working pressure and multi-size titles cannot silently select one dimension", () => {
  const pn = resolveEffectiveRequirements({ value_json: { attributes: { trykk: "PN16" } } });
  assert.equal(pn.requirements[0].property, "pn");
  assert.equal(pn.requirements[0].operator, "eq");
  for (const title of ["Rør DN25/DN65", "Rør DN25-65", "Rør DN25 og DN65"]) {
    const resolved = resolveEffectiveRequirements({ value_text: title });
    assert.ok(resolved.requirements.some(item => item.property === "dn" && item.issue), title);
  }
  const included = resolveEffectiveRequirements({ value_text: "Rør DN25 med ventil DN65" });
  assert.equal(included.requirements.find(item => item.property === "dn")?.value, 25);
  assert.ok(included.requirements.some(item => item.label === "Leveranseomfang" && item.issue));
});

test("mounting requirements remain technical while explicit quantity lines stay metadata", () => {
  const resolved = resolveEffectiveRequirements({ value_text: "SPRINKLER", value_json: {
    attributes: { plassering: "Hengende" },
    technicalSpecification: "SPRINKLER\nAntall stk 188\nLengde m 330\nRund sum RS\nPlassering: Hengende\nLeveres med to tilkoblinger"
  } });
  assert.equal(resolved.requirements.find(item => item.property === "orientation")?.value, "pendent");
  const prose = resolved.requirements.find(item => item.label === "Spesifikasjonstekst");
  assert.ok(prose?.issue);
  assert.equal(prose.source.raw, "Spesifikasjonstekst: Leveres med to tilkoblinger");
  assert.equal(resolveEffectiveRequirements({ value_json: { attributes: { plassering: "Hengende synlig i tak" } } }).requirements[0].value, null);
});

test("retrieval's context filter cannot erase delivery or documentation obligations", () => {
  const resolved = resolveEffectiveRequirements({ value_text: "Sprinkler DN15", value_json: { postNumber: "33.1",
    attributes: { omfang: "Leveres komplett med tilbehør", dokumentasjon: "FM sertifikat kreves", "pdf-kommentar": "NRF 1234567" },
    attributeSources: { omfang: { postNumber: "33", sourcePage: 2 } }
  } });
  const context = resolved.requirements.filter(item => item.label.startsWith("Kontekstkrav"));
  assert.equal(context.length, 2);
  assert.ok(context.every(item => item.issue));
  assert.equal(context[0].source.kind, "parent");
  assert.equal(evaluateTechnicalRequirements(resolved, "A", [observation("dn", 15)], now).status, "VERIFY");
});
