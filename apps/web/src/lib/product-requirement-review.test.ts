import assert from "node:assert/strict";
import test from "node:test";
import {
  newRequirementReview, parseRequirementReview, productRequirementChecks, requirementDecisionComplete,
  requirementReviewConfirmation, reviewProducts, validateRequirementReview, type RequirementReviewDraft
} from "./product-requirement-review";
import { validateDistributorProductMapping } from "./distributor-product-mapping";
import { bulkProductApprovalSelection } from "./bulk-product-approval";

const cabinet = {
  id: "11111111-1111-4111-8111-111111111111", value_text: "FORDELINGSSKAP", source_page: 17,
  value_json: { postNumber: "31.4.5", nsCode: "UB1.25A", quantity: 14, unit: "stk", attributes: {
    "antall utganger": "5 Kv og 4 Vv", "dimensjon tilførsel": "15", trykk: "PN6", drenering: "Ja", "materiale skap": "Valgfritt"
  } },
  source_excerpt: "31.4.5 UB1.25A\nFORDELINGSSKAP\nAndre krav:\na) Omfang og prisgrunnlag\nEksisterende kobberrør skal tilknyttes fordelerskap og nye PEX rør i rør føringer skal legges fra skap til utstyr.\nx) Mengderegler\nPosten er en opsjonspost som kan utløses ved behov."
};
const selection = { productNumber: "1234567", accessories: [{ name: "KV-fördelare", productNumber: "7654321", quantity: 1, unit: "st" }] };
const products = reviewProducts(selection);
function completeReview(): RequirementReviewDraft {
  const review = newRequirementReview(cabinet);
  for (const check of productRequirementChecks(cabinet)) review.decisions[check.id] = { status: "product", productKeys: [products[0].key], note: "" };
  review.decisions["attribute:antall utganger"].productKeys = products.map(item => item.key);
  review.confirmation = requirementReviewConfirmation(review, products);
  return review;
}

test("cabinet review retains copper, PEX, option, quantity and all structured requirements", () => {
  const checks = productRequirementChecks(cabinet);
  assert.ok(checks.some(check => check.text === "5 Kv og 4 Vv"));
  assert.ok(checks.some(check => check.id.startsWith("additional:") && check.text.includes("PEX")));
  assert.ok(checks.some(check => check.id.startsWith("additional:") && check.text.includes("opsjonspost")));
  assert.equal(checks.find(check => check.id === "source")?.text, cabinet.source_excerpt);
  assert.ok(checks.find(check => check.id === "quantity")?.text.includes("14"));
  assert.equal(checks.find(check => check.id === "attribute:materiale skap")?.optional, true);
});

test("pipe assembly requires separate review of included fittings and supports", () => {
  const checks = productRequirementChecks({ value_text: "DN 25 komplett med deler bend, albuer, t- stykker,endebunn og oppheng", value_json: { quantity: 303, unit: "m", attributes: { dimensjon: "DN25" } } });
  assert.deepEqual(checks.filter(check => check.id.startsWith("component:")).map(check => check.label), ["Böjar", "T-stycken", "Ändlock", "Upphängning"]);
});

test("a product selection and checkbox alone cannot approve a partially reviewed post", () => {
  assert.ok("error" in validateRequirementReview(cabinet, selection, undefined));
  const review = completeReview();
  delete review.decisions["attribute:drenering"];
  review.confirmation = requirementReviewConfirmation(review, products);
  assert.match((validateRequirementReview(cabinet, selection, review) as { error: string }).error, /Drenering/);
});

test("several selected articles can cover the same requirement and round-trip through mapping validation", () => {
  const review = completeReview();
  assert.ok("data" in validateRequirementReview(cabinet, selection, review));
  const mapping = validateDistributorProductMapping({ requirementId: cabinet.id, entryMethod: "catalog", userApproved: true, ...selection, requirementReview: review });
  assert.ok("data" in mapping);
  assert.ok("data" in validateRequirementReview(cabinet, mapping.data, mapping.data.requirementReview));
});

test("removing, replacing or changing the quantity of a component reopens its requirements", () => {
  const review = completeReview();
  for (const accessories of [[], [{ ...selection.accessories[0], quantity: 2 }], [{ ...selection.accessories[0], productNumber: "7654322" }]]) {
    assert.match((validateRequirementReview(cabinet, { ...selection, accessories }, review) as { error: string }).error, /krav återstår/);
  }
  assert.ok("error" in validateRequirementReview(cabinet, { ...selection, productNumber: "1234568" }, review));
});

test("adding an article or changing a comment requires a fresh final confirmation", () => {
  const review = completeReview();
  const changedSelection = { ...selection, accessories: [...selection.accessories, { name: "VV-fördelare", productNumber: "7654323", quantity: 1, unit: "st" }] };
  assert.match((validateRequirementReview(cabinet, changedSelection, review) as { error: string }).error, /Bekräfta/);
  review.decisions.scope.note = "Ett nytt underlag";
  assert.match((validateRequirementReview(cabinet, selection, review) as { error: string }).error, /Bekräfta/);
});

test("manual handling needs a comment and mandatory requirements cannot be skipped", () => {
  const mandatory = productRequirementChecks(cabinet).find(check => check.id === "attribute:drenering")!;
  assert.equal(requirementDecisionComplete(mandatory, { status: "handled", productKeys: [], note: " " }, products), false);
  assert.equal(requirementDecisionComplete(mandatory, { status: "not_applicable", productKeys: [], note: "Vill inte" }, products), false);
  assert.equal(requirementDecisionComplete(mandatory, { status: "handled", productKeys: [], note: "Dräneringsledning enligt V-20-01 detalj 4" }, products), true);
  const optional = productRequirementChecks(cabinet).find(check => check.optional)!;
  assert.equal(requirementDecisionComplete(optional, { status: "not_applicable", productKeys: [], note: "Material väljs enligt systemleverantör" }, products), true);
});

test("fresh source requirements, not submitted fields, govern review and invalidate previous approval", () => {
  const review = completeReview();
  const changed = { ...cabinet, source_excerpt: `${cabinet.source_excerpt}\nNytt krav på drenering.` };
  assert.match((validateRequirementReview(changed, selection, review) as { error: string }).error, /ändrats/);
  assert.deepEqual(newRequirementReview(changed, review).decisions, {});
  assert.ok("error" in validateRequirementReview({ ...cabinet, value_json: { ...cabinet.value_json, quantity: 15 } }, selection, review));
});

test("saved comments survive normalization without breaking final confirmation", () => {
  const review = completeReview();
  review.decisions.scope.note = "  Datablad sida 4  ";
  review.confirmation = requirementReviewConfirmation(review, products);
  const result = validateRequirementReview(cabinet, selection, JSON.parse(JSON.stringify(review)));
  assert.ok("data" in result);
  assert.ok("data" in validateRequirementReview(cabinet, selection, result.data));
});

test("component review keys use the same default units and field limits as the saved mapping", () => {
  const draft = { ...selection, accessories: [{ ...selection.accessories[0], name: "x".repeat(260), unit: "", notes: "x".repeat(520) }] };
  const mapping = validateDistributorProductMapping({ requirementId: cabinet.id, userApproved: true, entryMethod: "catalog", ...draft });
  assert.ok("data" in mapping);
  assert.deepEqual(reviewProducts(draft).map(item => item.key), reviewProducts(mapping.data).map(item => item.key));
});

test("malformed or oversized reviews are rejected and unknown product links never pass", () => {
  assert.equal(parseRequirementReview({ version: 1, revision: "x", confirmation: "x", decisions: [] }), null);
  const review = completeReview();
  review.decisions.scope.productKeys = ["unselected-product"];
  review.confirmation = requirementReviewConfirmation(review, products);
  assert.ok("error" in validateRequirementReview(cabinet, selection, review));
  review.decisions.scope.note = "x".repeat(1001);
  assert.equal(parseRequirementReview(review), null);
});

test("bulk approval cannot bypass a PDF post's requirement review", () => {
  assert.equal(bulkProductApprovalSelection({ requirement: { ...cabinet, mapping_fingerprint: "same" }, handled: false, memories: [{ requirement_fingerprint: "same", product_name: "Sprinkler", product_number: "9254043" }] }), null);
});
