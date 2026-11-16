import assert from "node:assert/strict";
import test from "node:test";
import { readPublicSprsokCatalog } from "./public-sprsok.server";
import { SPRSOK_PUBLIC_COLUMNS } from "./public-sprsok";

test("public catalog reads only published Sprsok fields, paginates, and projects output", async () => {
  const offsets: string[] = [];
  const products = await readPublicSprsokCatalog(async <T>(table: string, params?: Record<string, string>) => {
    assert.equal(table, "sprsok_product_search");
    assert.equal(params?.select, SPRSOK_PUBLIC_COLUMNS.join(","));
    assert.equal(params?.order, "id.asc");
    offsets.push(params!.offset);
    return Array.from({ length: params?.offset === "0" ? 500 : 2 }, (_, index) => ({ id: Number(params?.offset) + index + 1, sin: "TY1", leverandor: "Tyco", type: null, utforelse: null, k_verdi: null, rti: null, datablad: null, internal: "must not leak" })) as T[];
  });
  assert.equal(products.length, 502);
  assert.deepEqual(offsets, ["0", "500"]);
  assert.ok(products.every(row => !("internal" in row)));
});

test("a missing public view fails closed instead of exposing unreviewed legacy rows", async () => {
  await assert.rejects(readPublicSprsokCatalog(async () => { throw new Error("PGRST205"); }), /PGRST205/);
});
