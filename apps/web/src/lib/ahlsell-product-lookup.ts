import { AhlsellCatalogError, fetchAhlsellCandidateVariants, searchAhlsellPublicCatalog, type AhlsellMarket } from "./ahlsell-public-catalog";
import { applyAhlsellProductDetails, fetchAhlsellProductDetails, fetchAhlsellProductPage, parseAhlsellProductArticleNumber, parseAhlsellProductDetails, parseAhlsellProductSubtitle, safeAhlsellProductUrl } from "./ahlsell-product-subtitle";
import { ahlsellLookupArticleNumber } from "./ahlsell-lookup-input";
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
  const articleNumber = ahlsellLookupArticleNumber(query);
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
  const requestedNumber = input.articleNumber ?? (input.url
    ? new URL(input.url).pathname.split("/").filter(Boolean).at(-1)?.match(/^(\d{6,12})(?:---|$)/)?.[1] ?? null : null);
  // The public article redirect resolves the exact product without depending on
  // the search index or which family variant happens to rank first today.
  const productUrl = input.url ?? (requestedNumber ? `https://www.ahlsell.${input.market}/productVariantProxy/${requestedNumber}` : null);
  let pageUnavailable = false;
  signal?.throwIfAborted();
  if (productUrl) {
    const page = await fetchAhlsellProductPage({ productUrl, fetchImpl, signal, reportFailures: true }).catch(() => {
      signal?.throwIfAborted();
      pageUnavailable = true;
      return null;
    });
    signal?.throwIfAborted();
    const product = page ? parseAhlsellLookupPage(page.html, page.url) : null;
    const missingArticle = page && requestedNumber && [...page.html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)]
      .some(heading => cleanText(heading[1]).includes(`ikke finne en artikkel med det nummeret ${requestedNumber}`));
    if (page && !product && !missingArticle) pageUnavailable = true;
    if (page && product) {
      // An old article URL may redirect to its replacement. Do not silently import it.
      if (requestedNumber && product.articleNumber !== requestedNumber) {
        return { products: [], searchUrl: page.url, message: `Sökningen avser artikel ${requestedNumber}, men Ahlsell visar artikel ${product.articleNumber}. Kontrollera vilken artikel du vill välja.` };
      }
      const detail = parseAhlsellProductDetails(page.html, product.articleNumber, page.url);
      if (store && detail?.snapshot) await store.write(input.market, product.articleNumber, detail.snapshot).catch(() => undefined);
      return { products: [applyAhlsellProductDetails(product, detail)], searchUrl: page.url };
    }
    if (!requestedNumber) throw new AhlsellCatalogError("Produktens uppgifter kunde inte hämtas från Ahlsell. Sök på artikelnumret eller försök igen.");
  }

  const result = await searchAhlsellPublicCatalog({ market: input.market, query: requestedNumber ?? input.query, maxCandidates: 12, fetchImpl });
  signal?.throwIfAborted();
  let products: AhlsellLookupProduct[] = result.candidates;
  // Even a card with variantCount=1 can contain more variants in Ahlsell's API.
  // Explicit NRF searches must check those variants rather than rank substitutes.
  if (requestedNumber) {
    const exact = products.find((product) => product.articleNumber === requestedNumber);
    const families = exact ? [exact] : products.slice(0, 4);
    const variantResults = await Promise.allSettled(families.map(candidate => fetchAhlsellCandidateVariants({ candidate, market: input.market, fetchImpl })));
    products = variantResults.flatMap(result => result.status === "fulfilled" ? result.value : []).filter(product => product.articleNumber === requestedNumber);
    if (!products.length && exact) products = [exact];
    if (!products.length && (pageUnavailable || variantResults.some(result => result.status === "rejected"))) {
      throw new AhlsellCatalogError("Alla produktuppgifter kunde inte hämtas från Ahlsell. Försök igen om en stund.");
    }
  }
  products = [...new Map(products.map((product) => [product.articleNumber, product])).values()];
  const details = await fetchAhlsellProductDetails({ items: products.slice(0, 6), fetchImpl, signal, store });
  products = products.map(product => applyAhlsellProductDetails(product, details[product.articleNumber]));
  signal?.throwIfAborted();
  return {
    products,
    searchUrl: result.searchUrl,
    message: products.length ? undefined : requestedNumber
      ? `Ingen exakt träff för artikel ${requestedNumber} hos Ahlsell. Kontrollera numret eller klistra in produktens Ahlsell-länk.`
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
  const articleNumber = parseAhlsellProductArticleNumber(visible);
  const productName = cleanText(heading[1]).slice(0, 500);
  if (!articleNumber || !productName) return null;
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
