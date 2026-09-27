import assert from "node:assert/strict";
import test from "node:test";
import { AhlsellLookupInputError, lookupAhlsellProduct, parseAhlsellLookupPage, parseAhlsellLookupQuery } from "./ahlsell-product-lookup";
import { fetchAhlsellProductPage } from "./ahlsell-product-subtitle";
import { isAutomaticAhlsellLookup } from "./ahlsell-lookup-input";

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
  assert.equal(calls.length, 4);
  assert.ok(calls[3].pathname.includes("9257423"));
  assert.equal(calls[1].searchParams.get("parameters.SearchPhrase"), "9257423");
  assert.deepEqual(result.products.map((item) => item.articleNumber), ["9257423"]);
  assert.equal(result.products[0].productName, "Vit");
  assert.deepEqual(result.products[0].specifications, ["Tillverkare: Victaulic", "Farge: Hvit"]);
  assert.ok(!("variant" in result.products[0]));
});

test("does not return a replacement as an exact NRF match", async () => {
  const result = await lookupAhlsellProduct({ query: "9254064", market: "no", fetchImpl: async (input) => String(input).includes('/productVariantProxy/') ? new Response(null, { status: 404 }) : Response.json(String(input).includes("/variants?") ? variants : { productCount: 1, productCards: [card()] }) });
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

test("automatically looks up six- and eight-digit Ahlsell articles as well as NRF numbers", () => {
  for (const query of ["955911", "Art.nr: 955 911", "4011976", "NRF 401 19 76", "10000483"]) {
    assert.ok(parseAhlsellLookupQuery(query, "no").articleNumber);
    assert.equal(isAutomaticAhlsellLookup(query), true);
  }
  assert.equal(isAutomaticAhlsellLookup("https://www.ahlsell.no/productVariantProxy/4011976"), true);
  assert.equal(isAutomaticAhlsellLookup("vannmåler DN80"), false);
  assert.equal(isAutomaticAhlsellLookup("https://example.com/productVariantProxy/4011976"), false);
});

test("resolves a known article directly even when it is absent from the search index", async () => {
  const calls: string[] = [];
  const result = await lookupAhlsellProduct({ query: "4011976", market: "no", fetchImpl: async input => {
    const url = new URL(String(input)); calls.push(url.pathname);
    if (url.pathname === "/productVariantProxy/4011976") return new Response(null, { status: 302, headers: { Location: "/products/instrumenter/4011976" } });
    if (url.pathname === "/products/instrumenter/4011976") return new Response(page("4011976"), { headers: { "Content-Type": "text/html" } });
    assert.fail("A verified product page needs no search or variant request");
  } });
  assert.deepEqual(result.products.map(product => product.articleNumber), ["4011976"]);
  assert.equal(calls.length, 2);
});

test("accepts public article redirect links and reads shorter visible article identities", async () => {
  // Synthetic six-digit fixture: verifies supported format, not that 955911 exists.
  const result = await lookupAhlsellProduct({ query: "https://www.ahlsell.no/productVariantProxy/955911?utm_source=share", market: "no", fetchImpl: async input => {
    assert.equal(new URL(String(input)).search, "");
    return new Response(page("955911"), { headers: { "Content-Type": "text/html" } });
  } });
  assert.equal(result.products[0].articleNumber, "955911");
});

test("falls back to exact search when a product page is temporarily unavailable", async () => {
  for (const query of ["4011976", "https://www.ahlsell.no/products/instrumenter/4011976"]) {
    const result = await lookupAhlsellProduct({ query, market: "no", fetchImpl: async input => {
      const url = new URL(String(input));
      if (url.pathname === "/api/search") return Response.json({ productCount: 1, productCards: [card("4011976")] });
      return new Response(null, { status: 503 });
    } });
    assert.equal(result.products[0].articleNumber, "4011976");
  }
});

test("retains an exact variant from a successful family if another family fails", async () => {
  const result = await lookupAhlsellProduct({ query: "9257423", market: "no", fetchImpl: async input => {
    const url = new URL(String(input));
    if (url.pathname.includes('/productVariantProxy/')) return new Response(null, { status: 404 });
    if (url.pathname === '/api/search/variants') return url.searchParams.get('productCode') === 'broken'
      ? new Response(null, { status: 503 }) : Response.json(variants);
    return Response.json({ productCount: 2, productCards: [{...card('9257391'), code: 'broken'}, card()] });
  } });
  assert.deepEqual(result.products.map(product => product.articleNumber), ['9257423']);
});

test("distinguishes unavailable product data from a completed search without matches", async () => {
  await assert.rejects(lookupAhlsellProduct({ query: '4011976', market: 'no', fetchImpl: async input =>
    String(input).includes('/api/search?') ? Response.json({ productCount: 0, productCards: [] }) : new Response(null, { status: 503 })
  }), /kunde inte hämtas/);
  const missing = await lookupAhlsellProduct({ query: '955911', market: 'no', fetchImpl: async input =>
    String(input).includes('/api/search?') ? Response.json({ productCount: 0, productCards: [] }) : new Response(null, { status: 404 })
  });
  assert.deepEqual(missing.products, []);
  assert.match(missing.message ?? '', /Ingen exakt träff.*955911/);
});

test("never substitutes the product a public article link redirects to", async () => {
  const result = await lookupAhlsellProduct({ query: '4011976', market: 'no', fetchImpl: async () => new Response(page('4011975'), { headers: { 'Content-Type': 'text/html' } }) });
  assert.deepEqual(result.products, []);
  assert.match(result.message ?? '', /4011976.*4011975/);
});

test("public article redirects retain host, path and article validation", async () => {
  for (const query of ['https://www.ahlsell.no/productVariantProxy/private', 'https://www.ahlsell.no/productVariantProxy/4011976/other', 'https://www.ahlsell.no/productVariantProxy/4011976%2fadmin']) {
    await assert.rejects(lookupAhlsellProduct({ query, market: 'no', fetchImpl: async () => { assert.fail('Unexpected request'); } }), AhlsellLookupInputError);
  }
  let calls = 0;
  assert.equal(await fetchAhlsellProductPage({ productUrl: 'https://www.ahlsell.no/productVariantProxy/4011976', fetchImpl: async () => {
    calls++; return new Response(null, { status: 302, headers: { Location: 'https://example.com/products/4011976' } });
  } }), null);
  assert.equal(calls, 1);
});

test("does not start a fallback request after the user cancels a lookup", async () => {
  const controller = new AbortController(); let calls = 0;
  await assert.rejects(lookupAhlsellProduct({ query: '4011976', market: 'no', signal: controller.signal, fetchImpl: async () => {
    calls++; controller.abort(); throw controller.signal.reason;
  } }), /abort/i);
  assert.equal(calls, 1);
});

test("resolves Ahlsell's live legacy redirect without querying the search index", async () => {
  const result = await lookupAhlsellProduct({ query: '4011976', market: 'no', fetchImpl: async input => {
    const url = new URL(String(input));
    if (url.pathname === '/productVariantProxy/4011976') return new Response(null, { status: 302, headers: { Location: '/33/sprinkler-og-rillesystemer/instrumenter/4011976/?' } });
    if (url.pathname === '/products/sprinkler-og-rillesystemer/instrumenter/4011976/') return new Response(null, { status: 308, headers: { Location: '/products/sprinkler-og-rillesystemer/instrumenter/4011976' } });
    assert.equal(url.pathname, '/products/sprinkler-og-rillesystemer/instrumenter/4011976');
    return new Response(page('4011976'), { headers: { 'Content-Type': 'text/html' } });
  } });
  assert.equal(result.products[0].articleNumber, '4011976');
});

test("recognizes Ahlsell's explicit missing-article page even when served as HTTP 200", async () => {
  const result = await lookupAhlsellProduct({ query: '955911', market: 'no', fetchImpl: async input =>
    String(input).includes('/api/search?') ? Response.json({ productCount: 0, productCards: [] })
      : new Response('<h2>Vi kan dessverre ikke finne en artikkel med det nummeret 955911.</h2>', { headers: { 'Content-Type': 'text/html' } })
  });
  assert.deepEqual(result.products, []);
  assert.match(result.message ?? '', /Ingen exakt träff.*955911/);
});
