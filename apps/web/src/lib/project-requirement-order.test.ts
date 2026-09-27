import assert from "node:assert/strict";
import test from "node:test";
import { comparePostNumbers, sortProjectRequirementsBySource, projectRequirementOrderPostNumber } from "./project-requirement-order";

test("keeps the chapter introduction before numbered posts and retains explicit source order on a page", () => {
  const rows = [
    { id: "product", source_page: 1, value_json: { postNumber: "40.2", sourceOrder: 3 } },
    { id: "introduction", source_page: 1, value_json: { postNumber: null, sourceOrder: 1, chapterInformation: true } },
    { id: "information", source_page: 1, value_json: { postNumber: null, sourceOrder: 2 } }
  ];
  assert.deepEqual(sortProjectRequirementsBySource(rows).map(row => row.id), ["introduction", "information", "product"]);
  assert.equal(projectRequirementOrderPostNumber({ value_json: { postNumber: null }, source_excerpt: "Se post 40.411.3 for flere krav" }), null);
});

test("sorts product rows by page and natural post-number order", () => {
  const rows = [
    row("2.3", 3),
    row("3.10", 5),
    row("3.4", 5),
    row("2.1", 3),
    row("2.2", 3),
    row("1.9", 2)
  ];

  assert.deepEqual(
    sortProjectRequirementsBySource(rows).map((item) => record(item.value_json).postNumber),
    ["1.9", "2.1", "2.2", "2.3", "3.4", "3.10"]
  );
});

test("sorts wrapped NS 3420 post numbers numerically", () => {
  assert.ok(comparePostNumbers("0.33.332.3 325.2.1", "0.33.332.3 325.2.2") < 0);
});

function row(postNumber: string, sourcePage: number) {
  return { id: postNumber, source_page: sourcePage, value_json: { postNumber } };
}

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
