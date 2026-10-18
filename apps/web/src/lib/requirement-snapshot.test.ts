import assert from "node:assert/strict";
import test from "node:test";
import { requirementSnapshot } from "./requirement-snapshot";
import { compactProjectRequirement } from "./project-overview";
import { resolveRequirementOverviews } from "./project-overview-cache";
import { extractTechnicalDescriptionFromPages } from "@/modules/technical-description-extractor/extractor";
import { visibleProjectRequirements } from "./project-requirement-views";

const source = "33.332.7\n1.1.1. ARMATURER\nDet skal medtas soneventiler for hver etasje.\nDet skal medtas beskyttelseskurver i områder hvor dyser\ner utsatt for ytre påkjenning.\nDet skal være tilstrekkelig kapasitet på sluk for testing og\nnedtapping.";
const description = source.split("\n").slice(1).join(" ");
const saved = {
  id: "saved-armaturer", status: "inferred_unreviewed", source_page: 77, source_excerpt: source,
  value_text: description.replace(/^1\.1\.1/, ""), display_name: description.replace(/^1\.1\.1/, ""),
  updated_at: "2026-10-18T00:00:00Z", edit_revision: 0,
  value_json: { postNumber: "33.332.71.1.1", quantity: null, unit: null, attributes: { note: "Saved value" },
    productResolution: { status: "not_required" }, textStorage: { version: 1, references: { sourceText: "source_excerpt" } } },
  reviewer_comment: "Saved comment"
};

test("repairs the stored ARMATURER identity without reimporting or changing saved work", () => {
  const row = requirementSnapshot(saved);
  assert.equal(row.value_json.postNumber, "33.332.7");
  assert.equal(row.value_text, description);
  assert.equal(row.display_name, description);
  assert.equal(row.id, saved.id);
  assert.equal(row.source_excerpt, source);
  assert.equal(row.reviewer_comment, saved.reviewer_comment);
  assert.deepEqual(row.value_json.attributes, saved.value_json.attributes);
  assert.deepEqual(row.value_json.productResolution, saved.value_json.productResolution);
  assert.equal(row.value_json.quantity, null);
  assert.deepEqual(requirementSnapshot(row), row);
  assert.equal(saved.value_json.postNumber, "33.332.71.1.1");
});

test("preserves user-edited text and unrelated or genuinely wrapped post numbers", () => {
  const edited = requirementSnapshot({ ...saved, value_text: "My reviewed title", display_name: "My heading" });
  assert.equal(edited.value_text, "My reviewed title");
  assert.equal(edited.display_name, "My heading");
  for (const source_excerpt of [source.replace("33.332.7\n", "33.332.7.\n"), source.replace("1.1.1. ARMATURER", "1.1.1 UE3.211"), source.replace("33.332.7\n", "33.332.8\n")]) {
    assert.equal(requirementSnapshot({ ...saved, source_excerpt }).value_json.postNumber, saved.value_json.postNumber);
  }
});

test("reload discards old overview cache and retains the corrected text post as source data", async () => {
  const head = { ...saved, overview_cache: { version: -1, source_updated_at: saved.updated_at, source_revision: 0,
    summary: { ...saved, overview: {}, value_json: saved.value_json } } };
  const rows = await resolveRequirementOverviews([head], { loadDetails: async () => [saved], save: async () => {} });
  assert.equal((rows[0].value_json as Record<string, unknown>).postNumber, "33.332.7");
  assert.equal(rows[0].value_text, description);
  assert.equal((compactProjectRequirement(saved).value_json as Record<string, unknown>).postNumber, "33.332.7");
  assert.deepEqual(visibleProjectRequirements(rows), []);
});

test("new text and OCR imports keep the numbered heading and all three source requirements", () => {
  for (const method of ["text", "ocr"] as const) {
    const result = extractTechnicalDescriptionFromPages([{ pageNumber: 77, method, confidence: .98,
      text: "33.332.6 UE3.3A\nVANNTÅKESENTRAL\nAntall stk 1\n" + source +
        "\n33.332.8 UE3.211\nSONEVENTIL FOR VANNTÅKEANLEGG\nAntall stk 5\nKapittel: 33 Brannslokking" }]);
    const line = result.materialLines.find(row => row.postNumber === "33.332.7");
    assert.ok(line);
    assert.equal(line.sourceText, source);
    assert.equal(line.description, description);
    assert.equal(line.quantity, undefined);
    assert.equal(result.materialLines.some(row => row.postNumber === "33.332.71.1.1"), false);
  }
});
