import assert from "node:assert/strict";
import test from "node:test";
import {
  ahlsellMarketFromSearchUrl,
  searchAhlsellPublicCatalog
} from "./ahlsell-public-catalog";

test("normalizes every public Ahlsell result and follows result pages", async () => {
  const requestedUrls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requestedUrls.push(url.toString());
    const page = url.searchParams.get("parameters.page") ?? "1";
    const productCards = page === "1"
      ? [product("5505469", "Sprinklerventil S-1155", "Ulefos"), product("9257148", "UMC sprinklerventil", "")]
      : [product("9257150", "Sprinklerventil komplett", "Demo")];
    return Response.json({ productCount: 3, productCards });
  };

  const result = await searchAhlsellPublicCatalog({
    market: "no",
    query: "  Sprinklerventil   DN100 ",
    fetchImpl
  });

  assert.equal(result.query, "Sprinklerventil DN100");
  assert.equal(result.total, 3);
  assert.equal(result.candidates.length, 3);
  assert.equal(result.truncated, false);
  assert.equal(result.candidates[0].articleNumber, "5505469");
  assert.equal(result.candidates[0].manufacturer, "Ulefos");
  assert.equal(result.candidates[0].description, "Trykklasse PN16 & VDS-godkjent.");
  assert.equal(result.candidates[0].source, "catalog_search");
  assert.match(result.candidates[0].productUrl, /^https:\/\/www\.ahlsell\.no\/products\//);
  assert.equal(requestedUrls.length, 2);
  assert.equal(new URL(requestedUrls[0]).searchParams.get("parameters.SearchPhrase"), "Sprinklerventil DN100");
  assert.match(requestedUrls[1], /parameters\.page=2/);
});

test("deduplicates article numbers and reports a capped result as truncated", async () => {
  const fetchImpl: typeof fetch = async () => Response.json({
    productCount: 10,
    productCards: [product("5505469", "Sprinklerventil", "Ulefos")]
  });

  const result = await searchAhlsellPublicCatalog({
    market: "no",
    query: "Sprinklerventil",
    maxCandidates: 1,
    fetchImpl
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.truncated, true);
});

test("selects only supported Ahlsell markets from the generated search URL", () => {
  assert.equal(ahlsellMarketFromSearchUrl("https://www.ahlsell.se/search"), "se");
  assert.equal(ahlsellMarketFromSearchUrl("https://www.ahlsell.no/search"), "no");
  assert.equal(ahlsellMarketFromSearchUrl("https://example.com/search"), "no");
});

function product(articleNumber: string, name: string, brand: string) {
  return {
    name,
    brand,
    description: "Trykklasse PN16 &amp; <b>VDS-godkjent</b>.",
    firstVariationPageUrl: `/products/${articleNumber}/`,
    mostRelevantVariantId: articleNumber,
    image: { url: `/images/${articleNumber}.jpg` }
  };
}
