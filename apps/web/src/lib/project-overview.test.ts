import test from "node:test";
import assert from "node:assert/strict";
import { compactProjectRequirement, expandOverviewProjection, HOME_REQUIREMENT_SELECT, REQUIREMENT_OVERVIEW_SELECT, REQUIREMENT_SUMMARY_SELECT, TECHNICAL_DOCUMENT_SUMMARY_SELECT } from "./project-overview";
import { sortProjectRequirementsBySource } from "./project-requirement-order";
import { groupProjectRequirementViews } from "./project-requirement-views";
import { groupProductRequirementsByPdfChapter } from "./product-post-groups";
import { distributorRequirementKind } from "./distributor-requirement-lines";
import { productRequirementCategory } from "./product-requirement-category";
import { projectRequirementDataWarnings } from "./project-requirement-data-warnings";
import { productRequirementResolution } from "./product-requirement-resolution";

const row = (id: string, value: Record<string, unknown> = {}) => ({
  id, project_id: "project", category: "pipe", requirement_key: "UB1.1", value_text: "RØRLEDNING", status: "confirmed", source_page: 2,
  source_technical_description_document_id: "document", source_excerpt: "30.332.1\nAndre krav:\na) Full kommentar över sidbrytning",
  value_json: { postNumber: "30.332.1", sourceChapter: { title: "30 VVS", pageNumber: 1 }, quantity: 71.75, unit: "m", ...value }
});

test("compact rows preserve purchasing groups, quantities, chapter order and resolutions", () => {
  const rows = [row("pipe"), row("sum", { postNumber: "30.332.2", quantity: null, unit: "RS" }), row("info", { postNumber: "30.332.3", quantity: null, unit: null }), row("resolved", { productResolution: { status: "not_in_assortment", resolvedAt: "2026-09-27", resolvedBy: "user" } })];
  const compact = rows.map(compactProjectRequirement);
  const ids = (value: ReturnType<typeof groupProjectRequirementViews>) => Object.fromEntries(Object.entries(value).map(([key, rows]) => [key, rows.map(row => row.id)]));
  assert.deepEqual(ids(groupProjectRequirementViews(compact)), ids(groupProjectRequirementViews(rows)));
  assert.deepEqual(groupProductRequirementsByPdfChapter(compact).map(group => [group.title, group.requirements.map(row => row.id)]), groupProductRequirementsByPdfChapter(rows).map(group => [group.title, group.requirements.map(row => row.id)]));
  assert.deepEqual(productRequirementResolution(compact[3]), productRequirementResolution(rows[3]));
  assert.equal((compact[0].value_json as Record<string, unknown>).quantity, 71.75);
});

test("overview cannot discard legacy RS classification, source post number or source warnings", () => {
  const original = { ...row("legacy", { postNumber: null, unit: null, attributes: { "k-faktor": "114.5" } }), source_excerpt: "1401.40.411.\n38\nRund sum\nK-faktor: 1145" };
  const compact = compactProjectRequirement(original);
  assert.equal((compact.value_json as Record<string, unknown>).postNumber, "1401.40.411.38");
  assert.deepEqual(projectRequirementDataWarnings(compact), projectRequirementDataWarnings(original));
  assert.equal(distributorRequirementKind(compact), distributorRequirementKind(original));
  assert.equal(productRequirementCategory(compact), productRequirementCategory(original));
  assert.equal(groupProjectRequirementViews([compact]).rs.length, 1);
});

test("large specification and PDF comments remain intact in the original detail row only", () => {
  const text = "Kommentar och andra krav\n".repeat(10_000);
  const original = row("large", { technicalSpecification: text, attributes: { "pdf-kommentar": text }, sourcePages: [2, 3] });
  const before = JSON.stringify(original);
  const compact = compactProjectRequirement(original);
  assert.equal(JSON.stringify(original), before);
  assert.equal((original.value_json as Record<string, unknown>).technicalSpecification, text);
  assert.ok(JSON.stringify(compact).length < 1500);
  assert.equal(compact.source_excerpt, undefined);
  assert.equal((compact.value_json as Record<string, unknown>).technicalSpecification, undefined);
});

test("database projections reconstruct fields without requesting full JSON or source pages", () => {
  const expanded = expandOverviewProjection({ id: "a", overview_postNumber: "1.2.3", overview_postScope: "building-a", overview_quantity: 3, overview_unit: "st", overview_productResolution: { status: "not_in_assortment" } });
  assert.equal((expanded.value_json as Record<string, unknown>).postNumber, "1.2.3");
  assert.equal(expanded.overview_postNumber, undefined);
  assert.equal((compactProjectRequirement(expanded).value_json as Record<string, unknown>).postScope, "building-a");
  assert.ok(REQUIREMENT_SUMMARY_SELECT.includes("overview_postScope:value_json->postScope"));
  assert.ok(!REQUIREMENT_SUMMARY_SELECT.split(",").includes("value_json"));
  assert.ok(!REQUIREMENT_SUMMARY_SELECT.includes("source_excerpt"));
  assert.ok(!REQUIREMENT_OVERVIEW_SELECT.includes("technicalSpecification"));
  assert.ok(!TECHNICAL_DOCUMENT_SUMMARY_SELECT.includes("source_pages"));
});

test("recovering a display number cannot reorder same-page information rows", () => {
  const rows = [
    { ...row("first", { postNumber: null }), source_excerpt: "Se post 40.411.38" },
    { ...row("second", { postNumber: "40.411.39" }), source_excerpt: "40.411.39" }
  ];
  assert.deepEqual(sortProjectRequirementsBySource(rows.map(compactProjectRequirement)).map(row => row.id),
    sortProjectRequirementsBySource(rows).map(row => row.id));
});

test("Home preserves legacy RS evidence without loading technical specifications", () => {
  const row = expandOverviewProjection({ id: "legacy", overview_unit: null, overview_sourceText: "Rund sum\nRS" });
  assert.equal(distributorRequirementKind(row), "work");
  assert.ok(HOME_REQUIREMENT_SELECT.includes("overview_sourceText:value_json->sourceText"));
  assert.ok(!HOME_REQUIREMENT_SELECT.includes("sourceChapter"));
  assert.ok(!HOME_REQUIREMENT_SELECT.includes("technicalSpecification"));
});
