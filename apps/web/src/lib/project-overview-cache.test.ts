import test from "node:test";
import assert from "node:assert/strict";
import { compactProjectRequirement, REQUIREMENT_OVERVIEW_SELECT, type OverviewRow } from "./project-overview";
import { resolveRequirementOverviews, REQUIREMENT_OVERVIEW_VERSION } from "./project-overview-cache";

test("warm overview loads no source text; corrections and changed rules rebuild only affected summaries", async () => {
  const rows: OverviewRow[] = [1, 2].map(n => ({ id: String(n), edit_revision: 0, updated_at: "2026-10-11T12:00:00+00:00", source_page: n,
    source_excerpt: "33.500." + n + "\nK-faktor: 1145", value_text: "SPRINKLER", value_json: { postNumber: `33.500.${n}`, unit: "st", quantity: n, attributes: { "k-faktor": "114.5" } } }));
  const cache = new Map<string, Record<string, unknown>>();
  const reads: string[][] = [];
  const deps = { loadDetails: async (ids: string[]) => { reads.push(ids); return rows.filter(row => ids.includes(row.id)); },
    save: async (entries: Array<{requirement_id: string}>) => { for (const entry of entries) cache.set(entry.requirement_id, entry); } };
  const heads = () => rows.map(row => ({ id: row.id, edit_revision: row.edit_revision, updated_at: row.updated_at, overview_cache: cache.get(row.id) }));
  const first = await resolveRequirementOverviews(heads(), deps);
  assert.deepEqual(first, rows.map(compactProjectRequirement));
  assert.deepEqual(reads, [["1", "2"]]);
  reads.length = 0;
  assert.deepEqual(await resolveRequirementOverviews(heads(), deps), first);
  assert.equal(reads.length, 0);
  rows[0] = { ...rows[0], edit_revision: 1, value_json: { quantity: 99, unit: "st", postNumber: "33.500.1" } };
  assert.deepEqual(await resolveRequirementOverviews(heads(), deps), rows.map(compactProjectRequirement));
  assert.deepEqual(reads, [["1"]]);
  reads.length = 0;
  cache.set("2", { ...cache.get("2"), version: REQUIREMENT_OVERVIEW_VERSION - 1 });
  await resolveRequirementOverviews(heads(), deps);
  assert.deepEqual(reads, [["2"]]);
  assert.ok(!/source_excerpt|value_json|attributes/.test(REQUIREMENT_OVERVIEW_SELECT));
});

test("missing/deleted rows, legacy parent headings and unavailable cache storage remain safe", async () => {
  const row = { id: "child", edit_revision: 0, updated_at: "now", source_page: 1, value_json: { parentPostNumber: "33.500", postNumber: "33.500.1", technicalSpecification: "33.500 Utstyr\nUNDERPOST\n33.500.1 Sprinkler" } };
  const result = await resolveRequirementOverviews([row, { id: "deleted" }], {
    loadDetails: async () => [row], save: async () => { throw new Error("offline"); }
  });
  assert.equal(result.length, 1);
  assert.equal((result[0].value_json as Record<string, unknown>).parentDescription, "Utstyr");
});
