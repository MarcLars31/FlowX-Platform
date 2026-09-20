import { ahlsellMldlCandidate, ahlsellMldlProducts } from "./ahlsell-mldl-catalog";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";
import { normalizeTechnicalText } from "./ahlsell-requirement-context";
import { lookupAhlsellProduct, parseAhlsellLookupQuery, type AhlsellLookupProduct, type AhlsellLookupResult } from "./ahlsell-product-lookup";
import { isAssemblyComponentCandidate, type AssemblyComponentKind } from "./product-assembly-plan";

export function accessoryDatabaseProducts(kind?: AssemblyComponentKind, query?: string): AhlsellLookupProduct[] {
  const input = query ? parseAhlsellLookupQuery(query, "no") : null;
  const exact = input?.articleNumber ?? (input?.url ? new URL(input.url).pathname.split("/").filter(Boolean).at(-1)?.match(/^(\d{6,12})(?:---|$)/)?.[1] : null);
  // A URL without an identifiable article must be resolved at Ahlsell, never guessed locally.
  if (input?.url && !exact) return [];
  const terms = input && !exact ? normalizeTechnicalText(input.query).split(/\s+/).filter(Boolean) : [];
  return ahlsellMldlProducts().filter(product =>
    (!kind || isAssemblyComponentCandidate(kind, product.productName))
    && (!exact || product.articleNumber === exact)
    && terms.every(term => normalizeTechnicalText(`${product.productName} ${product.searchText}`).includes(term))
  ).flatMap(product => {
    const candidate = ahlsellMldlCandidate(product.articleNumber);
    return candidate ? [candidate] : [];
  });
}

/** Manual accessory search shares the same deduplicated database + web results. */
export async function lookupAccessoryProducts(input: Parameters<typeof lookupAhlsellProduct>[0]): Promise<AhlsellLookupResult> {
  const parsed = parseAhlsellLookupQuery(input.query, input.market);
  const database = parsed.market === "no" ? accessoryDatabaseProducts(undefined, parsed.query) : [];
  try {
    const live = await lookupAhlsellProduct(input);
    return { ...live, products: mergeAhlsellCandidates(database, live.products),
      message: database.length && !live.products.length ? [live.message, "Visar även träffar från MLDL. Artiklarna kunde inte bekräftas i Ahlsells webbsökning."].filter(Boolean).join(" ") : live.message };
  } catch (error) {
    input.signal?.throwIfAborted();
    if (!database.length) throw error;
    return { products: mergeAhlsellCandidates(database, []), searchUrl: `https://www.ahlsell.${parsed.market}/search?parameters.SearchPhrase=${encodeURIComponent(parsed.query)}`,
      message: "Ahlsells webbsökning kunde inte slutföras. Visar träffar från MLDL; försök igen för att komplettera." };
  }
}
