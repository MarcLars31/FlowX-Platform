import { attachAhlsellAccessorySuggestions } from "./ahlsell-accessory-suggestions";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { ahlsellMldlCandidate, ahlsellMldlProduct } from "./ahlsell-mldl-catalog";
import { findMldlOnlyCandidates } from "./ahlsell-mldl-matching";
import { ahlsellMarketFromSearchUrl, searchAhlsellPublicCatalogQueries, type AhlsellCatalogResult } from "./ahlsell-public-catalog";
import { buildAhlsellRequirementGuide, type AhlsellPublicCandidate } from "./ahlsell-public-match";
import { lookupAhlsellProduct } from "./ahlsell-product-lookup";
import { fetchAhlsellProductDetails, safeAhlsellProductUrl } from "./ahlsell-product-subtitle";
import { technicalConflictWarnings, withTechnicalConflictAssessment } from "./ahlsell-technical-conflicts";

/** MLDL is always available. Only product search terms/NRFs go to Ahlsell. */
export async function findAhlsellHybridCandidates(requirement: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<AhlsellCatalogResult> {
  const guide = buildAhlsellRequirementGuide(requirement);
  const local = findMldlOnlyCandidates(requirement);
  const market = ahlsellMarketFromSearchUrl(guide.searchUrl);
  const primaryArticle = local.find(candidate => technicalConflictWarnings(candidate).length === 0)?.articleNumber;
  const queries = [...new Set([...(primaryArticle ? [primaryArticle] : []), ...guide.searchQueries.slice(0, 2)])];
  // Check the leading MLDL article by its exact NRF, independently of the
  // broader family search, which may return a different variant of that family.
  const [search, exact] = await Promise.allSettled([
    searchAhlsellPublicCatalogQueries({ market, queries: guide.searchQueries.slice(0, 2), fetchImpl, maxCandidates: 40, maxPages: 2, maxVariantFamilies: 4 }),
    primaryArticle ? lookupAhlsellProduct({ query: primaryArticle, market, fetchImpl }) : Promise.resolve(null)
  ]);
  const result = search.status === "fulfilled" ? search.value : null;
  const exactProducts = exact.status === "fulfilled" ? (exact.value?.products ?? [])
    .filter(product => articleKey(product.articleNumber) === articleKey(primaryArticle ?? "")) : [];
  const publicByArticle = new Map((result?.candidates ?? []).map(candidate => [articleKey(candidate.articleNumber), candidate]));
  for (const candidate of exactProducts) publicByArticle.set(articleKey(candidate.articleNumber), candidate);
  const publicCandidates = [...publicByArticle.values()];
  const preliminary = rankAhlsellCandidates(requirement, publicCandidates);
  const detailCandidates = [...new Map([
    ...preliminary.filter(candidate => ahlsellMldlProduct(candidate.articleNumber)).slice(0, 3),
    ...preliminary
  ].map(candidate => [articleKey(candidate.articleNumber), candidate])).values()]
    .filter(candidate => safeAhlsellProductUrl(candidate.productUrl, candidate.articleNumber)).slice(0, 6);
  // The subtitle is technical evidence, so retrieve it BEFORE final ranking.
  // The fetcher validates both URL and visible article identity, and caches it.
  const details = await fetchAhlsellProductDetails({ items: detailCandidates, fetchImpl });
  const detailed = publicCandidates.map(candidate => {
    const detail = details[candidate.articleNumber];
    return { ...candidate,
      articleNumber: detail?.articleNumber ?? candidate.articleNumber,
      description: detail?.subtitle ?? candidate.description,
      specifications: [...candidate.specifications, ...(detail?.specifications ?? []), ...(detail?.subtitle ? [detail.subtitle] : [])]
    };
  });
  const aliases = new Map(Object.entries(details).flatMap(([catalogArticle, detail]) =>
    detail && articleKey(catalogArticle) !== articleKey(detail.articleNumber)
      ? [[articleKey(detail.articleNumber), catalogArticle] as const] : []));
  const detailedByArticle = new Map<string, AhlsellPublicCandidate>();
  for (const [index, candidate] of detailed.entries()) {
    const previous = detailedByArticle.get(articleKey(candidate.articleNumber));
    const hasDetails = Boolean(details[publicCandidates[index].articleNumber]);
    detailedByArticle.set(articleKey(candidate.articleNumber), previous ? {
      ...(hasDetails ? previous : candidate), ...(hasDetails ? candidate : previous),
      specifications: [...new Set([...previous.specifications, ...candidate.specifications])]
    } : candidate);
  }
  const candidates = complementMldlCandidates(requirement, local, [...detailedByArticle.values()], aliases);
  const failedQueries = [...(result?.failedQueries ?? (search.status === "rejected" ? guide.searchQueries.slice(0, 2) : [])),
    ...(exact.status === "rejected" && primaryArticle ? [primaryArticle] : [])];
  const anySearchSucceeded = search.status === "fulfilled" || (Boolean(primaryArticle) && exact.status === "fulfilled");
  return {
    query: queries[0] ?? guide.searchQuery, queries, searchUrl: guide.searchUrl,
    searchUrls: [...new Set([...(result?.searchUrls ?? []), ...(exact.status === "fulfilled" && exact.value ? [exact.value.searchUrl] : [])])],
    total: candidates.length, candidates,
    truncated: result?.truncated ?? false, failedQueries,
    publicSearchStatus: !anySearchSucceeded ? "unavailable" : failedQueries.length ? "partial" : "available"
  };
}

/** Combine exact-article evidence and reassess missing values, preserving conflicts. */
export function complementMldlCandidates(requirement: Record<string, unknown>, local: AhlsellPublicCandidate[], publicCandidates: AhlsellPublicCandidate[], pageVerifiedAliases: ReadonlyMap<string, string> = new Map()) {
  const localByArticle = new Map(local.map(candidate => [articleKey(candidate.articleNumber), candidate]));
  const reassessedLocal = new Map(localByArticle);
  const rankedPublic = publicCandidates.map(publicCandidate => {
    const alias = pageVerifiedAliases.get(articleKey(publicCandidate.articleNumber));
    const databaseArticle = ahlsellMldlCandidate(publicCandidate.articleNumber) ?? (alias ? ahlsellMldlCandidate(alias) : null);
    const database = localByArticle.get(articleKey(publicCandidate.articleNumber))
      ?? (alias ? localByArticle.get(articleKey(alias)) : undefined)
      ?? (databaseArticle ? rankAhlsellCandidates(requirement, [databaseArticle])[0] : undefined);
    const [publicAssessment] = rankAhlsellCandidates(requirement, [publicCandidate]);
    if (!database) return publicAssessment;
    const [combined] = rankAhlsellCandidates(requirement, [{
      ...database,
      description: [database.description, publicCandidate.productName, publicCandidate.description].filter(Boolean).join(" · "),
      specifications: [...new Set([...database.specifications, ...publicCandidate.specifications])],
      // Only missing-value warnings are regenerated. Variant ambiguity and
      // confirmed conflicts must survive evidence from a second source.
      matchWarnings: [...new Set([
        ...(database.matchWarnings ?? []).filter(warning => !/saknas i produktinformationen|arbetstryck behöver verifieras/.test(warning)),
        ...technicalConflictWarnings(publicAssessment)
      ])]
    }]);
    if (alias) reassessedLocal.delete(articleKey(alias));
    reassessedLocal.set(articleKey(publicCandidate.articleNumber), withTechnicalConflictAssessment({
      ...database, ...combined,
      articleNumber: publicCandidate.articleNumber,
      matchScore: Math.max(database.matchScore ?? 0, combined.matchScore ?? 0),
      matchReasons: [...new Set([...(database.matchReasons ?? []), ...(combined.matchReasons ?? [])])],
      exactMatch: database.exactMatch === true && (combined.matchWarnings?.length ?? 0) === 0
    }));
    return { ...publicCandidate, ...combined, productName: publicCandidate.productName,
      articleNumber: publicCandidate.articleNumber,
      description: publicCandidate.description, productUrl: publicCandidate.productUrl,
      source: publicCandidate.source, evidenceSources: ["ahlsell_public" as const] };
  });
  return attachAhlsellAccessorySuggestions(requirement, mergeAhlsellCandidates([...reassessedLocal.values()], rankedPublic));
}

function articleKey(value: string) {
  // Only the validated product page may resolve a catalogue id to its NRF.
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
