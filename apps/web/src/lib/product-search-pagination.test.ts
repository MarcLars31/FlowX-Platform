import assert from "node:assert/strict";
import test from "node:test";
import { rankedProductSearchPage } from "./product-search-pagination";

test("exact article variants lead every page without omissions, duplicates or incorrect totals", async () => {
  const exact = ["exact1", "exact2", "exact3"];
  const other = ["other1", "other2", "other3", "other4"];
  const read = async (group: "exact" | "other" | "all", limit: number, offset: number) => {
    const rows = group === "exact" ? exact : group === "other" ? other : [...exact, ...other];
    return { rows: rows.slice(offset, offset + limit), total: rows.length };
  };
  const pages = await Promise.all([0, 2, 4, 6, 8].map(offset => rankedProductSearchPage("ABC", 2, offset, read)));
  assert.deepEqual(pages.flatMap(page => page.rows), [...exact, ...other]);
  assert.ok(pages.every(page => page.total === 7));
});

test("browsing without a query requires only one database page", async () => {
  let calls = 0;
  const result = await rankedProductSearchPage("", 50, 50, async (group, limit, offset) => {
    calls++;
    assert.deepEqual([group, limit, offset], ["all", 50, 50]);
    return { rows: ["next page"], total: 51 };
  });
  assert.equal(calls, 1);
  assert.equal(result.total, 51);
});
