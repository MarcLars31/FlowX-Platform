import assert from "node:assert/strict";
import test from "node:test";
import { accessoryDatabaseProducts, lookupAccessoryProducts } from "./ahlsell-accessory-lookup";
import { lookupAssemblyComponents } from "./assembly-component-lookup";
import { productAssemblyPlan } from "./product-assembly-plan";
import { assessAssemblyComponents } from "./assembly-component-matching";
import type { AhlsellLookupProduct } from "./ahlsell-product-lookup";

const requirement = { category: "sprinkler_head", value_text: "Sprinkler", value_json: { attributes: {
  plassering: "Innfelt, synlig montasje i tak", "dekkskive/pyntering (ved innfelling)": "Todelt rosett", beskyttelse: "Nei"
} } };
const component = productAssemblyPlan(requirement)!.components[0];
const product = (articleNumber: string, productName: string): AhlsellLookupProduct => ({ articleNumber, productName,
  manufacturer: "Victaulic", productUrl: `https://www.ahlsell.no/products/test/${articleNumber}/`, source: "catalog_search", specifications: [] });
const main = product("9999801", "Sprinklerhode Victaulic V2762 DN15 K80");
const webOnly = product("9999802", "V27 rosett hvit til sprinkler");
const shared = product("9254009", '1/2" V27 dekkskive 2-delt ESC Justerbar. hvit');

function fakeCatalog(items: AhlsellLookupProduct[], failSearch = false): typeof fetch {
  return async input => {
    const url = new URL(String(input));
    const article = url.pathname.split("/").filter(Boolean).at(-1);
    if (url.pathname.startsWith("/productVariantProxy/") || url.pathname.startsWith("/products/")) {
      const p = [main, ...items].find(p => p.articleNumber === article);
      if (!p) return new Response("", { status: 404 });
      return new Response(`<h1 data-test="product-name">${p.productName}</h1><span class="text-card-item-number"><span>${p.articleNumber}</span></span>`, { headers: { "Content-Type": "text/html" } });
    }
    if (failSearch) return new Response("Temporarily unavailable", { status: 503 });
    return Response.json({ productCount: items.length, productCards: items.map(p => ({ name: p.productName, mostRelevantVariantId: p.articleNumber, firstVariationPageUrl: p.productUrl, brand: p.manufacturer })) });
  };
}

test("manual accessory lookup includes database and web products once per NRF with both sources retained", async () => {
  const result = await lookupAccessoryProducts({ query: "V27 dekkskive", market: "no", fetchImpl: fakeCatalog([shared, webOnly]) });
  assert.equal(result.products.filter(p => p.articleNumber === shared.articleNumber).length, 1);
  assert.ok(result.products.some(p => p.articleNumber === webOnly.articleNumber));
  assert.ok(result.products.some(p => p.articleNumber === "9254032"));
  assert.deepEqual(new Set(result.products.find(p => p.articleNumber === shared.articleNumber)!.evidenceSources), new Set(["mldl_database", "ahlsell_public"]));
});

test("automatic rosette lookup retains local matches when the precise web query has no hits", async () => {
  const result = await lookupAssemblyComponents({ requirement, component, mainArticleNumber: main.articleNumber,
    query: "client text must not select a different family", automatic: true, market: "no", fetchImpl: fakeCatalog([]) });
  assert.ok(result.products.some(p => p.articleNumber === "9254009"));
  assert.ok(!result.products.some(p => p.articleNumber === "9254034"), "V34 rosette cannot fit V2762 by family evidence");
  assert.ok(result.products.every(p => p.exactMatch === false && p.matchWarnings?.length));
});

test("an unavailable web search leaves database accessories selectable and reports the partial search", async () => {
  const result = await lookupAssemblyComponents({ requirement, component, mainArticleNumber: main.articleNumber,
    query: "Rosett", automatic: true, market: "no", fetchImpl: fakeCatalog([], true) });
  assert.ok(result.products.some(p => p.articleNumber === "9254009"));
  assert.match(result.message ?? "", /kunde inte slutföras/);
  const manual = await lookupAccessoryProducts({ query: "V27 dekkskive", market: "no", fetchImpl: fakeCatalog([], true) });
  assert.ok(manual.products.length);
  assert.match(manual.message ?? "", /kunde inte slutföras/);
});

test("an exact accessory NRF search does not append other database variants", () => {
  assert.deepEqual(accessoryDatabaseProducts("escutcheon", "9254009").map(p => p.articleNumber), ["9254009"]);
  assert.deepEqual(accessoryDatabaseProducts("escutcheon", shared.productUrl).map(p => p.articleNumber), ["9254009"]);
  assert.deepEqual(accessoryDatabaseProducts("bend", "9254009"), []);
});

test("family compatibility includes catalog names without for/til and allows a stated shared family", () => {
  const candidates = [product("1", "V27 dekkskive"), product("2", "V34 dekkskive"), product("3", "V27/V34 rosett")];
  assert.deepEqual(assessAssemblyComponents(requirement, component, candidates, main).map(p => p.articleNumber), ["1", "3"]);
});

test("cancelling lookup propagates instead of presenting partial results as a completed search", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(lookupAccessoryProducts({ query: "V27 dekkskive", market: "no", signal: controller.signal,
    fetchImpl: fakeCatalog([]) }), { name: "AbortError" });
});
