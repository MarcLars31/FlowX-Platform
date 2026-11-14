import assert from "node:assert/strict";
import test from "node:test";
import { compactRequirementText, expandRequirementText } from "./requirement-text-storage";
import { requirementSnapshot } from "./requirement-snapshot";
import { projectRequirementDetails } from "./project-requirement-details";
import { compactProjectRequirement } from "./project-overview";
import { planTechnicalDescriptionRows } from "./technical-description-persistence";

test("exact source copies round trip without changing PDF details, overview or resumable IDs", () => {
  const source = "33.500.1 UE2.11111132 SPRINKLER\nAntall: 60 st\nK-faktor: 80\n" + "Krav til montasje.\n".repeat(1000);
  const row = { id: "r", source_page: 1, source_excerpt: source, value_text: "SPRINKLER", value_json: { extractionVersion: 1, sourceText: source, technicalSpecification: source, quantity: 60, unit: "st", postNumber: "33.500.1", attributes: { "k-faktor": "80" } } };
  const stored = compactRequirementText(row);
  assert.ok(JSON.stringify(stored).length < JSON.stringify(row).length * 0.4);
  assert.deepEqual(expandRequirementText(stored), row);
  assert.deepEqual(projectRequirementDetails(requirementSnapshot(stored)), projectRequirementDetails(row));
  assert.deepEqual(compactProjectRequirement(requirementSnapshot(stored)), compactProjectRequirement(row));
  assert.deepEqual(compactRequirementText(stored), stored);
  const key = (row: Record<string, unknown>) => [row.source_page, row.source_excerpt];
  assert.deepEqual(planTechnicalDescriptionRows("doc", [row], [], key).rows.map(row => row.id), planTechnicalDescriptionRows("doc", [stored], [], key).rows.map(row => row.id));
});

test("distinct inherited requirements, empty values and manual corrections are never replaced", () => {
  for (const specification of ["Parent requirements\nUNDERPOST\nOwn text", "", null]) {
    const row = { source_excerpt: "Own text", value_json: { sourceText: "Corrected text", technicalSpecification: specification } };
    assert.deepEqual(expandRequirementText(compactRequirementText(row)), row);
  }
  const candidate = { raw_text: "Original", normalized_value: { technicalSpecification: "Original" } };
  assert.deepEqual(expandRequirementText(compactRequirementText(candidate, true), true), candidate);
  const stored = compactRequirementText({ source_excerpt: "Original", value_json: { sourceText: "Original" } });
  const edited = { ...stored, value_json: { ...stored.value_json, sourceText: "Corrected" } };
  assert.equal(expandRequirementText(compactRequirementText(edited)).value_json.sourceText, "Corrected");
});
