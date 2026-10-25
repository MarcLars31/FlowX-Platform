import { searchAhlsellPublicCatalog, fetchAhlsellCandidateVariants, type AhlsellMarket } from "./ahlsell-public-catalog";
import { AhlsellLookupInputError, parseAhlsellLookupQuery, type AhlsellLookupResult } from "./ahlsell-product-lookup";

/** A family must actually contain the requested article. Never derive other
 * article numbers from dimensions or carry a seed article's evidence to siblings. */
export async function lookupAhlsellProductSeries({ query, market, signal, fetchImpl = fetch }: {
  query: unknown; market: AhlsellMarket; signal?: AbortSignal; fetchImpl?: typeof fetch;
}): Promise<AhlsellLookupResult> {
  const input = parseAhlsellLookupQuery(query, market);
  if (!input.articleNumber) throw new AhlsellLookupInputError("Velg en artikkel før du søker etter seriens dimensjoner.");
  signal?.throwIfAborted();
  const result = await searchAhlsellPublicCatalog({ market, query: input.articleNumber, maxCandidates: 4, fetchImpl });
  const families = new Map<string, Awaited<ReturnType<typeof fetchAhlsellCandidateVariants>>>();
  for (const candidate of result.candidates.slice(0,4)) {
    signal?.throwIfAborted();
    if (!candidate.familyCode) continue;
    const variants = await fetchAhlsellCandidateVariants({ candidate: {
      articleNumber: candidate.articleNumber, familyCode: candidate.familyCode,
      // Variant rows must supply their own name and specifications. A missing
      // name must not inherit the selected article's dimension or material.
      productName: "", productUrl: candidate.productUrl, manufacturer: candidate.manufacturer,
      specifications: [], source: "catalog_search"
    }, market, fetchImpl });
    if (variants.some(variant => variant.articleNumber === input.articleNumber)) families.set(candidate.familyCode, variants);
  }
  signal?.throwIfAborted();
  const products = families.size === 1 ? [...families.values()][0].filter(product=>Boolean(product.productName.trim())) : [];
  return { products, searchUrl: result.searchUrl, message: products.length ? undefined : "Seriens varianter kunne ikke identifiseres entydig. Søk og velg produkter per underpost." };
}
