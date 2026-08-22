import assert from "node:assert/strict";
import test from "node:test";
import {
  ahlsellMarketFromSearchUrl,
  searchAhlsellPublicCatalog,
  searchAhlsellPublicCatalogQueries
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

test("combines synonym searches and resolves the exact Ahlsell variant article", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/search/variants") {
      return Response.json({
        settings: { headers: { "0": "K-faktor", "1": "Responstemperatur", "2": "Farge", "3": "Responstid" } },
        items: [
          variant("9254042", "Messing"),
          variant("9254508", "Hvit")
        ]
      });
    }
    return Response.json({
      productCount: 1,
      productCards: [{
        ...product("9254042", "Sprinklerhoder V2703 SR - Opp", "Victaulic"),
        code: "P_27707783_33",
        numberOfVariants: 13
      }]
    });
  };

  const result = await searchAhlsellPublicCatalogQueries({
    market: "no",
    queries: ["Sprinkler K80 SR Opp", "Sprinklerhode K80 SR 68", "Sprinklerhode K80 Hvit"],
    fetchImpl
  });

  assert.deepEqual(result.queries, ["Sprinkler K80 SR Opp", "Sprinklerhode K80 SR 68", "Sprinklerhode K80 Hvit"]);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].articleNumber, "9254508");
  assert.match(result.candidates[0].productUrl, /9254508/);
  assert.ok(result.candidates[0].specifications.includes("K-faktor: 80"));
  assert.ok(result.candidates[0].specifications.includes("Farge: Hvit"));
});

test("checks the technically relevant product family before earlier unrelated search cards", async () => {
  const variantRequests: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/search/variants") {
      variantRequests.push(url.searchParams.get("productCode") ?? "");
      return Response.json({
        settings: { headers: { "0": "Utvendig rørdiameter" } },
        items: [{
          code: "10000483",
          buyable: true,
          url: "/products/ror/10000483/",
          productName: "Rillede rør 48,3 mm",
          isActiveVariant: true,
          attributes: { "0": { value: "48,3", unit: "mm" } }
        }]
      });
    }
    return Response.json({
      productCount: 2,
      productCards: [
        {
          ...product("9000001", "Anboringsklammer 48,3 mm", "Demo"),
          code: "WRONG_FAMILY",
          numberOfVariants: 10
        },
        {
          ...product("10000480", "Rillede rør i lengder", "Demo"),
          code: "PIPE_FAMILY",
          numberOfVariants: 12
        }
      ]
    });
  };

  const result = await searchAhlsellPublicCatalogQueries({
    market: "no",
    queries: ["Rør sprinkler 48.3mm"],
    maxVariantFamilies: 1,
    fetchImpl
  });

  assert.deepEqual(variantRequests, ["PIPE_FAMILY"]);
  assert.equal(result.candidates[1].articleNumber, "10000483");
  assert.ok(result.candidates[1].specifications.includes("Utvendig rørdiameter: 48,3 mm"));
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

function variant(articleNumber: string, color: string) {
  return {
    code: articleNumber,
    buyable: true,
    url: `/products/sprinkler/${articleNumber}/`,
    productName: "Sprinklerhoder V2703 SR - Opp",
    isActiveVariant: articleNumber === "9254042",
    attributes: {
      "0": { value: "80", unit: "" },
      "1": { value: "68", unit: "°C" },
      "2": { value: color, unit: "" },
      "3": { value: "Standardrespons", unit: "" }
    }
  };
}
