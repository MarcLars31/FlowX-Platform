import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductSearchDetails } from "../components/ProductSearchDetails";
import { TechnicalEvaluationDetails } from "../components/TechnicalEvaluationDetails";
import { productEvidenceHref, productSearchTrace, type ProductSearchAttempt } from "./product-search-trace";
import { requirementForSearch, withEffectiveRequirements } from "./effective-requirements";
import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { searchAhlsellPublicCatalogQueries } from "./ahlsell-public-catalog";
import { findAhlsellHybridCandidates } from "./ahlsell-hybrid-matching";
import { evaluateTechnicalRequirements } from "./technical-evaluator";

// Synthetic project and catalogue responses; no customer files or external requests.
const requirement = withEffectiveRequirements({ id: "synthetic-post", source_page: 9, value_text: "DN25", value_json: {
  postNumber: "31.1.1", parentPostNumber: "31.1", parentDescription: "Stålrør", unit: "m",
  attributes: { dimensjon: "DN25", materiale: "Stål", monteringskrav: "Avklares med prosjekterende" },
  attributeSources: { materiale: { postNumber: "31.1" } }
} });

test("trace preserves inherited field origin without inventing a page and keeps unresolved controls", () => {
  const input = requirementForSearch(requirement);
  const guide = { ...buildAhlsellRequirementGuide(input), interpretationNotes: ["Syntetisk tolkning fra motoren"] };
  const trace = productSearchTrace(requirement, input, guide, []);
  const material = trace.inputs.find(item => item.label === "materiale")!;
  assert.equal(material.source.kind, "parent");
  assert.equal(material.source.postNumber, "31.1");
  assert.equal(material.source.page, undefined);
  assert.equal(trace.requirements.requirements.find(item => item.label === "materiale")?.source.page, undefined);
  assert.equal(trace.inputs.find(item => item.label === "dimensjon")?.source.page, 9);
  assert.equal(trace.requirements.revision, requirement.effectiveRequirements.revision);
  const html = renderToStaticMarkup(createElement(ProductSearchDetails, { trace }));
  assert.match(html, /Hovedpost 31.1 · side ikke registrert/);
  assert.match(html, /Må tolkes manuelt/);
  assert.match(html, /Syntetisk tolkning fra motoren/);
  assert.match(html, /Ingen leverandørsøk er registrert/);
});

test("records only attempted normalized queries including failures and the three-query cap", async () => {
  const attempts: ProductSearchAttempt[] = [];
  const sent: string[] = [];
  const result = await searchAhlsellPublicCatalogQueries({ market: "no", queries: ["  trace  one  ", "trace one", "trace fail", "trace three", "not sent"],
    onSearch: attempt => attempts.push(attempt), fetchImpl: async input => {
      const query = new URL(String(input)).searchParams.get("SearchPhrase") ?? new URL(String(input)).searchParams.get("searchPhrase");
      sent.push(String(input));
      if (String(input).includes("trace+fail") || query === "trace fail") throw new Error("Synthetic failure");
      return Response.json({ productCount: 0, productCards: [] });
    } });
  assert.deepEqual(attempts.map(item => item.query), ["trace one", "trace fail", "trace three"]);
  assert.equal(attempts[1].status, "failed");
  assert.equal(sent.length, 3);
  assert.deepEqual(result.failedQueries, ["trace fail"]);
});

test("hybrid search retains its attempted searches and criteria when the supplier is unavailable", async () => {
  const result = await findAhlsellHybridCandidates(requirement, async () => { throw new Error("Offline fixture"); });
  assert.ok(result.searchTrace?.attempts.length);
  assert.ok(result.searchTrace.attempts.every(item => item.status === "failed"));
  assert.deepEqual(result.searchTrace.criteria, buildAhlsellRequirementGuide(requirementForSearch(requirement)).criteria);
  assert.equal(result.searchTrace.requirements.revision, requirement.effectiveRequirements.revision);
});

test("manual lookup displays the submitted query without claiming automatic technical search filters", () => {
  const input = requirementForSearch(requirement);
  const trace = productSearchTrace(requirement, input, buildAhlsellRequirementGuide(input), [{ kind: "manual", query: "My exact article", status: "completed" }], "manual");
  assert.deepEqual(trace.inputs, []);
  assert.deepEqual(trace.criteria, []);
  const html = renderToStaticMarkup(createElement(ProductSearchDetails, { trace }));
  assert.match(html, /My exact article/);
  assert.match(html, /Prosjektkravene brukes i den tekniske kontrollen etterpå/);
  assert.doesNotMatch(html, /Teknisk informasjon lest av søkemotoren/);
});

test("comparison retains missing evidence and shows source excerpts safely without a fabricated link", () => {
  const evaluation = evaluateTechnicalRequirements(requirement.effectiveRequirements, "test-article", [{
    property: "dn", value: 25, productId: "test-article", source: "javascript:alert(1)", raw: "<script>test</script>", documented: true
  }]);
  const html = renderToStaticMarkup(createElement(TechnicalEvaluationDetails, { evaluation }));
  assert.match(html, /Sammenlign med produktopplysningene/);
  assert.match(html, /Må kontrolleres/);
  assert.match(html, /Sammenlignbar produktopplysning mangler/);
  assert.match(html, /&lt;script&gt;test&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="javascript/);
  assert.equal(productEvidenceHref("MLDL v1"), undefined);
  assert.equal(productEvidenceHref("https://user:secret@example.com"), undefined);
  assert.equal(productEvidenceHref("https://example.com/datasheet.pdf"), "https://example.com/datasheet.pdf");
});
