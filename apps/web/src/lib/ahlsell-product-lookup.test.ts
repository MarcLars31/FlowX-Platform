import assert from "node:assert/strict";
import test from "node:test";
import { AhlsellLookupInputError, lookupAhlsellProduct, parseAhlsellLookupPage, parseAhlsellLookupQuery } from "./ahlsell-product-lookup";
import { fetchAhlsellProductPage } from "./ahlsell-product-subtitle";

const productUrl = "https://www.ahlsell.no/products/sprinkler/9257423---white/";
const page = (number = "9257423") => `<h1 data-test="product-name">Sprinkler &amp; tillbehör</h1><div>1/2&quot; Vit 68°C</div><span class="text-card-item-number text-gray">Artikkelnr:<div><span class="text-card-item-number text-primary-main"><span>${number}</span></span></div></span>`;
const card = (number = "9257392", variantCount = 1) => ({ name: "Sprinklerhode", mostRelevantVariantId: number, firstVariationPageUrl: `/products/sprinkler/${number}/`, code: "P_family", numberOfVariants: variantCount, brand: "Victaulic" });
const variants = {
  settings: { headers: { "0": "Farge" } },
  items: [
    { code: "9257392", productName: "Messing", url: "/products/sprinkler/9257392/", buyable: true, isActiveVariant: true },
    { code: "9257423", productName: "Vit", url: "/products/sprinkler/9257423/", buyable: true, attributes: { "0": { value: "Hvit" } } }
  ]
};

test("normalizes NRF numbers and chooses the market from a pasted product URL", () => {
  for (const value of ["9257423", " 925 74 23 ", "NRF-nr. 925-74-23", "NRF nummer: 9257423"]) {
    assert.equal(parseAhlsellLookupQuery(value, "no").articleNumber, "9257423");
  }
  assert.equal(parseAhlsellLookupQuery("www.ahlsell.se/products/test/9257423/?utm_source=share", "no").market, "se");
  assert.equal(parseAhlsellLookupQuery("sprinkler gitter", "no").query, "sprinkler gitter");
});

test("rejects unsafe URLs and malformed input before any fetch", async () => {
  for (const query of [null, {}, "", "a", "x".repeat(2001), "https://example.com/products/a", "http://www.ahlsell.no/products/a", "https://www.ahlsell.no.evil.test/products/a", "https://user:pass@www.ahlsell.no/products/a", "https://www.ahlsell.no:8443/products/a", "https://127.0.0.1/products/a", "https://www.ahlsell.no/login", "https://www.ahlsell.no/products/..%2fadmin"]) {
    await assert.rejects(lookupAhlsellProduct({ query, market: "no", fetchImpl: async () => { assert.fail("Unexpected network request"); } }), AhlsellLookupInputError);
  }
});

test("looks up the exact NRF even when Ahlsell returns another active variant and count=1", async () => {
  const calls: URL[] = [];
  const result = await lookupAhlsellProduct({ query: "9257423", market: "no", fetchImpl: async (input) => {
    const url = new URL(String(input)); calls.push(url);
    return Response.json(url.pathname.endsWith("/variants") ? variants : { productCount: 1, productCards: [card()] });
  } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].searchParams.get("parameters.SearchPhrase"), "9257423");
  assert.deepEqual(result.products.map((item) => item.articleNumber), ["9257423"]);
  assert.equal(result.products[0].productName, "Vit");
  assert.deepEqual(result.products[0].specifications, ["Tillverkare: Victaulic", "Farge: Hvit"]);
  assert.ok(!("variant" in result.products[0]));
});

test("does not return a replacement as an exact NRF match", async () => {
  const result = await lookupAhlsellProduct({ query: "9254064", market: "no", fetchImpl: async (input) => Response.json(String(input).includes("/variants?") ? variants : { productCount: 1, productCards: [card()] }) });
  assert.deepEqual(result.products, []);
  assert.match(result.message ?? "", /Ingen exakt träff.*9254064/);
});

test("keeps a verified exact search card when optional variant details are unavailable", async () => {
  const result = await lookupAhlsellProduct({ query: "9257392", market: "no", fetchImpl: async (input) => {
    if (String(input).includes("/variants?")) throw new Error("Network unavailable");
    return Response.json({ productCount: 1, productCards: [card()] });
  } });
  assert.equal(result.products[0].articleNumber, "9257392");
});

test("reports catalog errors rather than presenting them as no results", async () => {
  await assert.rejects(lookupAhlsellProduct({ query: "9257423", market: "no", fetchImpl: async () => new Response("unavailable", { status: 503 }) }), /HTTP 503/);
});

test("finds accessories by name using the public catalog", async () => {
  const result = await lookupAhlsellProduct({ query: "sprinklergitter", market: "no", fetchImpl: async () => Response.json({ productCount: 1, productCards: [{ ...card("9254088"), name: "Sprinkler gitter" }] }) });
  assert.equal(result.products[0].articleNumber, "9254088");
});

test("reads only visible product identity including PIM links and escaped names", async () => {
  const url = "https://www.ahlsell.no/products/sprinkler/pim78094948/";
  const html = `<script>${page("9999999")}</script>${page()}<h2>Andre produkter</h2>${page("8888888")}`;
  const result = await lookupAhlsellProduct({ query: url, market: "no", fetchImpl: async () => new Response(html, { headers: { "Content-Type": "text/html" } }) });
  assert.equal(result.products[0].articleNumber, "9257423");
  assert.equal(result.products[0].productName, "Sprinkler & tillbehör");
  assert.equal(result.products[0].subtitle, '1/2" Vit 68°C');
  assert.equal(parseAhlsellLookupPage("<h1>Login</h1>", url), null);
  assert.equal(parseAhlsellLookupPage('<h1 data-test="product-name">Missing identity</h1><h2>Recommendations</h2>' + page(), url), null);
});

test("does not import another NRF when a product link redirects to a replacement", async () => {
  let calls = 0;
  const result = await lookupAhlsellProduct({ query: productUrl, market: "no", fetchImpl: async () => ++calls === 1
    ? new Response(null, { status: 302, headers: { Location: "/products/sprinkler/9257392/" } })
    : new Response(page("9257392"), { headers: { "Content-Type": "text/html" } }) });
  assert.deepEqual(result.products, []);
  assert.match(result.message ?? "", /9257423.*9257392/);
});

test("blocks redirects outside public Ahlsell product pages", async () => {
  for (const location of ["https://127.0.0.1/private", "https://evil.test/products/9257423", "/api/private", "https://www.ahlsell.no/products/..%2fadmin"]) {
    let calls = 0;
    const result = await fetchAhlsellProductPage({ productUrl, fetchImpl: async () => {
      calls++; return new Response(null, { status: 302, headers: { Location: location } });
    } });
    assert.equal(result, null);
    assert.equal(calls, 1);
  }
});
