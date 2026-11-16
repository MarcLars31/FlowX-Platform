import assert from "node:assert/strict";
import { buildSprsokSearchOr, sprsokExactNumberFilter } from "../src/lib/sprsok-search";
import { createProductSearchStore } from "../src/lib/product-search-store";
import { findSimilarProducts, rankSimilarProducts, type SimilarityProduct } from "../src/lib/product-similarity";
import { matchesCatalogSearch } from "../src/lib/catalog-search";
import { normalizeArticleNumber } from "../src/lib/sprsok-sync-core";
import { rankedProductSearchPage } from "../src/lib/product-search-pagination";

// Read-only integration check. Credentials stay in process memory.
async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const project = process.argv[2];
  assert.ok(url && key && project, "Supply Supabase environment and expected project ref");
  assert.equal(new URL(url).hostname, `${project}.supabase.co`);
  async function read(table: string, params: Record<string,string>) {
    const headers: Record<string,string> = { apikey: key!, Prefer: "count=exact" };
    if (key!.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
    const response = await fetch(`${url}/rest/v1/${table}?${new URLSearchParams(params)}`, { headers });
    assert.equal(response.status, 200, `${table}: ${response.status} ${response.ok ? "" : await response.text()}`);
    return { rows: await response.json() as SimilarityProduct[], total: Number(response.headers.get("content-range")?.split("/")[1]) };
  }
  const store = createProductSearchStore<SimilarityProduct>({ select: async (table,params) => (await read(table,params)).rows, selectWithCount: read });
  const all = await read("flowx_product_search_v2", { select: "*", order: "id.asc", limit: "1000" });
  assert.equal(all.rows.length, all.total, "Fixture must fit in one checked page");
  const fields = ["sin", "leverandor", "type", "utforelse", "k_verdi", "rti"] as const;
  const queries = ["Viking pendent", "Viking hängande", "Tyco quick response"];
  const searches = [];
  for (const q of queries) {
    const result = await read("flowx_product_search_v2", { select: "*", or: buildSprsokSearchOr(fields,q,true)!, limit: "1000" });
    assert.ok(result.rows.length > 0, `No matches: ${q}`);
    assert.ok(result.rows.every(row => matchesCatalogSearch(fields.map(field => row[field]),row.sin,q)), q);
    searches.push({ query: q, count: result.total });
  }
  const numeric = await read("flowx_product_search_v2", { select: "*", k_verdi: sprsokExactNumberFilter("80"), limit: "1000" });
  assert.ok(numeric.rows.length > 0);
  assert.ok(numeric.rows.every(row => /^80(?:[.,]0+)?(?:\s|\(|$)/.test(row.k_verdi ?? "")));
  const article = "RA-0611";
  const exactArticle = await rankedProductSearchPage(article,5,0, async (group,limit,offset) => read("flowx_product_search_v2", {
    select: "*", order: "sin.asc.nullslast,id.asc", limit:String(limit), offset:String(offset),
    or: buildSprsokSearchOr(fields,article,true)!,
    normalized_article_number: `${group === "exact" ? "eq" : "not.eq"}.${normalizeArticleNumber(article)}`
  }));
  assert.equal(exactArticle.rows[0]?.sin,"RA0611");
  let compared = 0, crossSupplier = 0;
  for (const source of all.rows) {
    const ranked = rankSimilarProducts(source, all.rows);
    const neutral = rankSimilarProducts({ ...source, leverandor: "same" }, all.rows.map(row => ({...row, leverandor:"same"})));
    assert.deepEqual(ranked.map(item => [item.product.id,item.score]), neutral.map(item => [item.product.id,item.score]));
    if (ranked.length) compared++;
    crossSupplier += ranked.filter(item => item.product.leverandor !== source.leverandor).length;
  }
  assert.ok(compared > 0 && crossSupplier > 0);
  const sample = all.rows.find(row => row.source === "sprsok" && rankSimilarProducts(row,all.rows).some(item => item.product.leverandor !== row.leverandor))!;
  const retrieved = await findSimilarProducts(sample, store.selectRows, 5);
  assert.ok(retrieved.products.length > 0);
  assert.equal(retrieved.truncated,false);
  console.log(JSON.stringify({ project, total: all.total, searches, k80: numeric.total,
    productsWithAlternatives: compared, crossSupplierComparisons: crossSupplier,
    sample: { sin: sample.sin, id: sample.id, supplier: sample.leverandor, type: sample.type, k:sample.k_verdi, orientation: sample.utforelse, rti:sample.rti },
    similar: retrieved.products.map(row => ({sin:row.sin,supplier:row.leverandor,k:row.k_verdi,orientation:row.utforelse,rti:row.rti,similarity:row.similarity})),
    result: "passed" },null,2));
}
main().catch(error => { console.error(error); process.exitCode=1; });
