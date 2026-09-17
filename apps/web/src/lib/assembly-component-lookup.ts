import { ahlsellMldlCandidate } from "./ahlsell-mldl-catalog";
import { lookupAhlsellProduct, type AhlsellLookupProduct, type AhlsellLookupResult } from "./ahlsell-product-lookup";
import { fetchAhlsellProductDetails } from "./ahlsell-product-subtitle";
import { searchAhlsellPublicCatalogQueries, type AhlsellMarket } from "./ahlsell-public-catalog";
import { assemblyComponentSearch, isAssemblyComponentCandidate, type AssemblyComponent } from "./product-assembly-plan";
import { assessAssemblyComponents } from "./assembly-component-matching";

/** Resolve the selected article on the server. Client-supplied names or search
 * terms cannot establish technical compatibility with the main product. */
export async function lookupAssemblyComponents({ requirement, component, mainArticleNumber, query, automatic, market, signal, fetchImpl = fetch }: {
  requirement: Record<string, unknown>; component: AssemblyComponent; mainArticleNumber?: unknown;
  query: unknown; automatic: boolean; market: AhlsellMarket; signal?: AbortSignal; fetchImpl?: typeof fetch;
}): Promise<AhlsellLookupResult> {
  const article = typeof mainArticleNumber === "string" && /^\d{7,12}(?:N5)?$/i.test(mainArticleNumber.trim()) ? mainArticleNumber.trim() : "";
  let main: AhlsellLookupProduct | null = article ? ahlsellMldlCandidate(article) : null;
  if (!main && article) {
    const result = await lookupAhlsellProduct({ query: article, market, signal, fetchImpl }).catch(() => null);
    main = result?.products.find(product => product.articleNumber.toUpperCase() === article.toUpperCase()) ?? null;
  }
  signal?.throwIfAborted();
  if (main) main = (await withDetails([main], fetchImpl))[0];
  const automaticQuery = assemblyComponentSearch(component, main ? [main.productName, main.subtitle, main.description, main.manufacturer, ...main.specifications].filter(Boolean).join(" ") : "");
  const result: AhlsellLookupResult = automatic
    ? await searchAhlsellPublicCatalogQueries({ market, queries: [automaticQuery], fetchImpl, maxCandidates: 24, maxPages: 2, maxVariantFamilies: 4 })
      .then(result => ({ products: result.candidates, searchUrl: result.searchUrl }))
    : await lookupAhlsellProduct({ query, market, signal, fetchImpl });
  signal?.throwIfAborted();
  const family = result.products.filter(product => isAssemblyComponentCandidate(component.kind, `${product.productName} ${product.subtitle ?? ""}`));
  const products = assessAssemblyComponents(requirement, component, await withDetails(family, fetchImpl), main);
  return { ...result, products, message: products.length ? undefined
    : "Inga passande produktförslag hittades för den här delen. Kontrollera om delen ingår i huvudprodukten eller komplettera produktunderlaget." };
}

async function withDetails(products: AhlsellLookupProduct[], fetchImpl: typeof fetch) {
  const details = await fetchAhlsellProductDetails({ items: products.slice(0, 6), fetchImpl });
  return products.map(product => {
    const detail = details[product.articleNumber];
    // Preserve an explicit selected NRF; aliases and replacements need their own choice.
    if (!detail || detail.articleNumber !== product.articleNumber) return product;
    return { ...product, subtitle: detail.subtitle ?? product.subtitle,
      specifications: [...new Set([...product.specifications, ...detail.specifications])] };
  });
}
