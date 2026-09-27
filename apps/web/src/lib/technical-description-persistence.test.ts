import assert from "node:assert/strict";
import test from "node:test";
import {
  isCompleteTechnicalDescription,
  persistenceKey,
  persistTechnicalDescriptionBatches,
  planTechnicalDescriptionRows
} from "./technical-description-persistence";

test("a 3560-post import resumes after a failed batch without duplicating posts or changing saved IDs", async () => {
  const input = Array.from({ length: 3560 }, (_, index) => ({ page: index + 1, text: `Post ${index}` }));
  const saved: Array<(typeof input)[number] & { id: string }> = [];
  const key = (row: Record<string, unknown>) => [row.page, row.text];
  let writes = 0;
  const initial = planTechnicalDescriptionRows("document-a", input, saved, key);
  await assert.rejects(persistTechnicalDescriptionBatches(initial.missing, async batch => {
    if (++writes === 12) throw new Error("database interruption");
    saved.push(...batch);
  }), /interruption/);
  assert.equal(saved.length, 1100);
  const priorIds = saved.map(row => row.id);
  const retry = planTechnicalDescriptionRows("document-a", input, saved, key);
  assert.equal(retry.missing.length, 2460);
  assert.deepEqual(retry.rows.map(row => row.id), initial.rows.map(row => row.id));
  await persistTechnicalDescriptionBatches(retry.missing, async batch => { saved.push(...batch); });
  assert.equal(saved.length, 3560);
  assert.equal(new Set(saved.map(row => row.id)).size, 3560);
  assert.deepEqual(saved.slice(0, 1100).map(row => row.id), priorIds);
  assert.equal(planTechnicalDescriptionRows("document-a", input, saved, key).missing.length, 0);
});

test("batches bound row count and UTF-8 size while preserving every row and order", async () => {
  const rows = Array.from({ length: 2236 }, (_, page) => ({ page, text: "å".repeat(page % 2 ? 12000 : 20) }));
  const saved: typeof rows = [];
  await persistTechnicalDescriptionBatches(rows, async batch => {
    assert.ok(batch.length <= 100);
    assert.ok(Buffer.byteLength(JSON.stringify(batch)) <= 512_000);
    saved.push(...batch);
  });
  assert.deepEqual(saved, rows);
});

test("legacy IDs and repeated source text survive retry; different documents cannot share IDs", () => {
  const input = [{ text: "Same text", page: 2 }, { text: "Same text", page: 2 }];
  const key = (row: Record<string, unknown>) => [row.page, row.text];
  const plan = planTechnicalDescriptionRows("a", input, [{ ...input[0], id: "existing-id" }], key);
  assert.equal(plan.rows[0].id, "existing-id");
  assert.equal(plan.missing.length, 1);
  assert.notEqual(plan.rows[1].id, plan.rows[0].id);
  assert.notEqual(plan.rows[1].id, planTechnicalDescriptionRows("b", input, [], key).rows[1].id);
  assert.equal(persistenceKey({ a: 1, b: [2, 3] }), persistenceKey({ b: [2, 3], a: 1 }));
});

test("partially saved documents are never reported as completed duplicates", () => {
  assert.equal(isCompleteTechnicalDescription("extracting", 3560, 3560, 3560, true), false);
  assert.equal(isCompleteTechnicalDescription("completed", 3560, 0, 3560, true), false);
  assert.equal(isCompleteTechnicalDescription("completed", 1000, 1000, 3560, true), false);
  assert.equal(isCompleteTechnicalDescription("requires_review", 3560, 3560, 3560, true), true);
  assert.equal(isCompleteTechnicalDescription("completed", 3560, 0, 3560, false), true);
});
