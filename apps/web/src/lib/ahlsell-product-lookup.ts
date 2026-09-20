import { AhlsellCatalogError, fetchAhlsellCandidateVariants, searchAhlsellPublicCatalog, type AhlsellMarket } from "./ahlsell-public-catalog";
import { applyAhlsellProductDetails, fetchAhlsellProductDetails, fetchAhlsellProductPage, parseAhlsellProductDetails, parseAhlsellProductSubtitle, safeAhlsellProductUrl } from "./ahlsell-product-subtitle";
import type { AhlsellEvidenceStore } from "./ahlsell-technical-evidence";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

export type AhlsellLookupProduct = AhlsellPublicCandidate & { subtitle?: string };
export type AhlsellLookupResult = { products: AhlsellLookupProduct[]; searchUrl: string; message?: string };
export class AhlsellLookupInputError extends Error {}

export function parseAhlsellLookupQuery(value: unknown, market: AhlsellMarket) {
  if (typeof value !== "string" || value.length > 2000) throw new AhlsellLookupInputError("Ange ett NRF-nummer, produktnamn eller en Ahlsell-produktlänk.");
  const query = value.trim();
  if (/^(?:https?:|www\.|ahlsell\.)/i.test(query) || query.includes("://")) {
    const url = safeAhlsellProductUrl(/^https?:/i.test(query) ? query : `https://${query}`);
    if (!url) throw new AhlsellLookupInputError("Klistra in en produktlänk från ahlsell.no eller ahlsell.se.");
    return { query: url, url, market: new URL(url).hostname.endsWith(".se") ? "se" as const : "no" as const, articleNumber: null };
  }
  const number = query.replace(/^nrf\s*(?:[- ]?(?:nr|nummer))?\.?\s*:?\s*/i, "").replace(/[\s-]/g, "");
  const articleNumber = /^\d{7}$/.test(number) ? number : null;
  if (query.length < 2 || query.length > 180) throw new AhlsellLookupInputError("Ange minst två tecken och högst 180 tecken för sökningen.");
  return { query: articleNumber ?? query, url: null, market, articleNumber };
}

export async function lookupAhlsellProduct({ query, market, fetchImpl = fetch, signal, store }: {
  query: unknown;
  market: AhlsellMarket;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  store?: AhlsellEvidenceStore;
}): Promise<AhlsellLookupResult> {
  const input = parseAhlsellLookupQuery(query, market);
  if (input.url) {
    const page = await fetchAhlsellProductPage({ productUrl: input.url, fetchImpl, signal });
    if (!page) throw new AhlsellCatalogError("Produktsidan kunde inte hämtas från Ahlsell. Försök söka på NRF-numret.");
    const product = parseAhlsellLookupPage(page.html, page.url);
    if (!product) throw new AhlsellCatalogError("Produktens namn och NRF-nummer kunde inte läsas. Sök på NRF-numret i stället.");
    // An old article URL may redirect to its replacement. Do not silently import it.
    const requestedNumber = new URL(input.url).pathname.split("/").filter(Boolean).at(-1)?.match(/^(\d{7})(?:---|$)/)?.[1];
    if (requestedNumber && product.articleNumber !== requestedNumber) {
      return { products: [], searchUrl: page.url, message: `Länken avser NRF ${requestedNumber}, men Ahlsell visar NRF ${product.articleNumber}. Öppna Ahlsell och kopiera länken till den artikel du vill välja.` };
    }
    const detail = parseAhlsellProductDetails(page.html, product.articleNumber, page.url);
    if (store && detail?.snapshot) await store.write(input.market, product.articleNumber, detail.snapshot).catch(() => undefined);
    return { products: [applyAhlsellProductDetails(product, detail)], searchUrl: page.url };
  }

  const result = await searchAhlsellPublicCatalog({ market: input.market, query: input.query, maxCandidates: 12, fetchImpl });
  signal?.throwIfAborted();
  let products: AhlsellLookupProduct[] = result.candidates;
  // Even a card with variantCount=1 can contain more variants in Ahlsell's API.
  // Explicit NRF searches must check those variants rather than rank substitutes.
  if (input.articleNumber) {
    const exact = products.find((product) => product.articleNumber === input.articleNumber);
    const families = exact ? [exact] : products.slice(0, 4);
    const variants = (await Promise.all(families.map((candidate) =>
      fetchAhlsellCandidateVariants({ candidate, market: input.market, fetchImpl }).catch((error) => {
        if (exact) return [];
        throw error;
      })
    ))).flat();
    products = variants.filter((product) => product.articleNumber === input.articleNumber);
    if (!products.length && exact) products = [exact];
  }
  products = [...new Map(products.map((product) => [product.articleNumber, product])).values()];
  const details = await fetchAhlsellProductDetails({ items: products.slice(0, 6), fetchImpl, signal, store });
  products = products.map(product => applyAhlsellProductDetails(product, details[product.articleNumber]));
  signal?.throwIfAborted();
  return {
    products,
    searchUrl: result.searchUrl,
    message: products.length ? undefined : input.articleNumber
      ? `Ingen exakt träff för NRF ${input.articleNumber} hos Ahlsell. Kontrollera numret eller klistra in produktens Ahlsell-länk.`
      : "Inga produkter hittades hos Ahlsell. Prova andra sökord eller klistra in en produktlänk."
  };
}

/** Read the visible product header, not recommendations or embedded scripts. */
export function parseAhlsellLookupPage(html: string, productUrl: string): AhlsellLookupProduct | null {
  const safeUrl = safeAhlsellProductUrl(productUrl);
  if (!safeUrl) return null;
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const heading = /<h1\b(?=[^>]*\bdata-test\s*=\s*["']product-name["'])[^>]*>([\s\S]*?)<\/h1>/i.exec(visible);
  if (!heading) return null;
  const header = visible.slice(heading.index + heading[0].length, heading.index + heading[0].length + 12_000).split(/<h[12]\b/i)[0];
  const articleNumber = /<span\b[^>]*class=["'][^"']*\btext-card-item-number\b[^"']*["'][^>]*>\s*(?:<span\b[^>]*>\s*)?(\d{7})\s*<\/span>/i.exec(header)?.[1] ?? "";
  const productName = cleanText(heading[1]).slice(0, 500);
  if (!/^\d{7}$/.test(articleNumber) || !productName) return null;
  return { articleNumber, productName, subtitle: parseAhlsellProductSubtitle(visible) ?? undefined, manufacturer: "", productUrl: safeUrl, specifications: [], source: "catalog_search" };
}

function cleanText(value: string) {
  const named: Record<string, string> = { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">" };
  return value.replace(/<[^>]*>/g, "").replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|nbsp|lt|gt);/gi, (entity, key: string) => {
    if (!key.startsWith("#")) return named[key.toLowerCase()] ?? entity;
    const hex = key[1].toLowerCase() === "x";
    const point = parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  }).replace(/\s+/g, " ").trim();
}
