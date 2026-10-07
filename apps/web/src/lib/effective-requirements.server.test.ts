import assert from "node:assert/strict";
import test from "node:test";
import { loadEffectiveRequirement } from "./effective-requirements.server";
import { requirementSnapshot } from "./requirement-snapshot";
import { withEffectiveRequirements } from "./effective-requirements";
import type { selectUserRows } from "./supabase-user-rest";

test("card, search and saving share the saved snapshot, inherited requirements and project scope without reading PDFs", async () => {
  const row = { id: "r", project_id: "p", organization_id: "o", source_technical_description_document_id: "doc", source_page: 1,
    value_text: "STÅLRØR", updated_at: "2026-10-07", value_json: { postNumber: "33.1.1", attributes: { dimensjon: "DN25", materiale: "Stål" },
      attributeSources: { materiale: { postNumber: "33.1", sourcePage: 1 } } } };
  const parameters = { arbeidstrykk: "12 bar" };
  const readRows = (async (table: string, filters: Record<string, string>) => {
    assert.equal(filters.organization_id, "eq.o");
    assert.equal(table === "projects" ? filters.id : filters.project_id, "eq.p");
    assert.equal(filters.deleted_at, "is.null");
    if (table === "projects") return [{ id: "p", technical_parameters: parameters }];
    assert.equal(table, "project_requirements", "No PDF reads or re-extraction on a product lookup");
    assert.equal(filters.id, "eq.r");
    return [row];
  }) as typeof selectUserRows;
  const card = withEffectiveRequirements(requirementSnapshot(row), parameters);
  assert.deepEqual((await loadEffectiveRequirement("p", "r", "o", readRows))?.effectiveRequirements, card.effectiveRequirements);
  assert.ok(card.effectiveRequirements.requirements.some(item => item.source.kind === "parent"));
  assert.ok(card.effectiveRequirements.requirements.some(item => item.source.kind === "project"));
  const denied = (async (table: string) => table === "project_requirements" ? [row] : []) as typeof selectUserRows;
  assert.equal(await loadEffectiveRequirement("p", "r", "different-org", denied), null);
});

test("saved corrections and changed project requirements invalidate an earlier evaluation", async () => {
  let pressure = "12 bar";
  const readRows = (async (table: string) => table === "projects" ? [{ id: "p", technical_parameters: { arbeidstrykk: pressure } }]
    : [{ id: "r", value_json: { attributes: { materiale: "Aluminium" }, technicalSpecification: "Reviewed specification" } }]) as typeof selectUserRows;
  const first = await loadEffectiveRequirement("p", "r", "o", readRows);
  pressure = "16 bar";
  const second = await loadEffectiveRequirement("p", "r", "o", readRows);
  assert.notEqual(first?.effectiveRequirements.revision, second?.effectiveRequirements.revision);
  assert.equal((second?.value_json as { attributes: { materiale: string } }).attributes.materiale, "Aluminium");
});
