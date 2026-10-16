import assert from "node:assert/strict";
import test from "node:test";
import { createProductSearchStore } from "./product-search-store";

test("rolling deployment retains indexed search on the Sprsok view and annotates its source", async () => {
  const visited: string[] = [];
  const store = createProductSearchStore({
    select: async () => [],
    selectWithCount: async (table, params) => {
      visited.push(table);
      if (table.startsWith("flowx")) throw new Error("PGRST205 table not found");
      assert.equal(table, "sprsok_product_search");
      assert.equal(params.or, "indexed document query");
      return { rows: [{ id: 1 }], total: 1 };
    }
  });
  const result = await store.selectWithCount({ or: "indexed document query" }, { or: "legacy field query" });
  assert.deepEqual(visited, ["flowx_product_search_v2", "flowx_product_search", "sprsok_product_search"]);
  assert.deepEqual(result, { rows: [{ id: 1, source: "sprsok" }], total: 1 });
});

test("permission and timeout errors never fall back to a less restrictive table", async () => {
  let calls = 0;
  const fail = async () => { calls++; throw new Error("Supabase 403 permission denied"); };
  const store = createProductSearchStore({ select: fail, selectWithCount: fail });
  await assert.rejects(store.selectWithCount({}, {}), /403/);
  assert.equal(calls, 1);
});

test("numeric source links are resolved in unified views", async () => {
  const store = createProductSearchStore({
    select: async (table, params) => {
      assert.equal(table, "flowx_product_search_v2");
      assert.equal(params.id, "eq.sprsok:123");
      assert.match(params.select, /product_name.*technical_data/);
      return [{ id: "sprsok:123" }];
    },
    selectWithCount: async () => ({ rows: [], total: 0 })
  });
  assert.deepEqual(await store.selectRows({ id: "eq.123" }), [{ id: "sprsok:123" }]);
});

test("legacy tables receive no indexed columns or text IDs", async () => {
  const store = createProductSearchStore({
    select: async (table, params) => {
      if (table !== "sprsok_products") throw new Error("42P01 relation does not exist");
      assert.equal(params.id, "eq.123");
      return [{ id: 123 }];
    },
    selectWithCount: async (table, params) => {
      if (table !== "sprsok_products") throw new Error("42P01 relation does not exist");
      assert.equal(params.or, "legacy");
      assert.doesNotMatch(params.select, /source|technical_data/);
      return { rows: [{ id: 123 }], total: 1 };
    }
  });
  assert.equal((await store.selectRows({ id: "eq.sprsok:123" }))[0].id, 123);
  assert.equal((await store.selectWithCount({ or: "indexed" }, { or: "legacy" })).total, 1);
});
