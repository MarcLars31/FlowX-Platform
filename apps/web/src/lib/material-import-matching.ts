import { fittingDimensionCheck, materialCandidateScore, materialDimensionKind, materialDimensionMatch } from "./material-import-scoring";
export { fittingDimensionCheck } from "./material-import-scoring";
import { assessAhlsellLookupCandidates } from "./ahlsell-hybrid-matching";
import { lookupAhlsellProduct } from "./ahlsell-product-lookup";
import { searchAhlsellPublicCatalogQueries } from "./ahlsell-public-catalog";
import { applyAhlsellProductDetails, fetchAhlsellProductDetails, safeAhlsellProductUrl } from "./ahlsell-product-subtitle";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { technicalConflictWarnings } from "./ahlsell-technical-conflicts";
import type { AhlsellEvidenceStore } from "./ahlsell-technical-evidence";
import { materialInputWarnings, materialSearchQueries, materialSearchQuery, type MaterialCandidate, type MaterialSearchInput, type MaterialSearchResult } from "./material-import";

export function materialRequirement(input: MaterialSearchInput): Record<string, unknown> {
  const attributes: Record<string, string> = {};
  const dimensionKind = materialDimensionKind(input);
  if (/\b(?:kobber|koppar)/i.test(input.description)) attributes.Materiale = "Kobber";
  else if (/\b(?:rustfri|syrefast)/i.test(input.description)) attributes.Materiale = "Rustfritt stål";
  else if (/\b(?:stål|stålrør|stålror|stålrör)/i.test(input.description)) attributes.Materiale = "Stål";
  const pipe = /^r[øö]r\b/i.test(input.category) && input.unit.toLowerCase() === "m";
  if (pipe) attributes["Type produkt"] = "Rør";
  // A bare dimension in a material schedule is not evidence of DN.
  if (dimensionKind === "dn" && /^\s*(?:DN\s*)?\d+(?:[.,]\d+)?\s*$/i.test(input.dimension)) attributes.DN = input.dimension.replace(/^\s*DN\s*/i, "");
  if (dimensionKind === "outside" && /^\s*\d+(?:[.,]\d+)?\s*(?:mm)?\s*$/i.test(input.dimension)) attributes["Ytterdiameter"] = input.dimension.replace(/\s*mm\s*$/i, "") + " mm";
  // Keep every fitting port, in order. Unknown units remain a review point.
  if (input.fittingDimension) attributes["Fittingdimensjon (källa)"] = input.fittingDimension;
  return { category: pipe ? "pipe" : undefined,
    value_text: input.description.replace(/^\s*[A-Z]{2,5}\.\d+(?:\.\d+)*\s+(?:\d{3,4}\s+)?/i, "").replace(/_/g, " "),
    value_json: { attributes, unit: input.unit, technicalSpecification: input.details, sourceType: "excel_material" } };
}

type Dependencies = {
  search?: typeof searchAhlsellPublicCatalogQueries;
  lookup?: typeof lookupAhlsellProduct;
  details?: typeof fetchAhlsellProductDetails;
};

export async function matchMaterialRow(input: MaterialSearchInput, options: { fetchImpl?: typeof fetch; signal?: AbortSignal; store?: AhlsellEvidenceStore } = {}, dependencies: Dependencies = {}): Promise<MaterialSearchResult> {
  const { signal, store } = options;
  const baseFetch = options.fetchImpl ?? fetch;
  const fetchImpl: typeof fetch = (url, init) => {
    signal?.throwIfAborted();
    return baseFetch(url, { ...init, signal: signal ? AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) : init?.signal });
  };
  signal?.throwIfAborted();
  const query = materialSearchQuery(input);
  const queries = materialSearchQueries(input);
  const exact = /^\d{6,12}$/.test(query) || /^https:\/\//i.test(query);
  const search = exact
    ? await (dependencies.lookup ?? lookupAhlsellProduct)({ query, market: "no", fetchImpl, signal, store }).then(result => ({ candidates: result.products, searchUrl: result.searchUrl, failedQueries: [] as string[], message: result.message }))
    : await (dependencies.search ?? searchAhlsellPublicCatalogQueries)({ market: "no", queries, fetchImpl, maxCandidates: 24, maxPages: 1, maxVariantFamilies: 3 });
  const requirement = materialRequirement(input);
  // Assess every hit before limiting the display. The old six-card cut discarded
  // useful alternatives before their dimensions or product family were considered.
  const ranked = assessAhlsellLookupCandidates(requirement, search.candidates).sort((a, b) =>
    Number(a.technicalEvaluation?.status === "FAIL") - Number(b.technicalEvaluation?.status === "FAIL")
    || materialDimensionHint(input, b) - materialDimensionHint(input, a)
    || (b.matchScore ?? 0) - (a.matchScore ?? 0)).slice(0, 24);
  const details = await (dependencies.details ?? fetchAhlsellProductDetails)({ items: ranked.slice(0, 6), fetchImpl, signal, store });
  signal?.throwIfAborted();
  const enriched = ranked.map(candidate => applyAhlsellProductDetails(candidate, details[candidate.articleNumber]));
  const evaluated = assessAhlsellLookupCandidates(requirement, enriched);
  const candidates: MaterialCandidate[] = evaluated.flatMap(candidate => {
    const productUrl = safeAhlsellProductUrl(candidate.productUrl);
    if (!productUrl || !new URL(productUrl).hostname.endsWith(".no")) return [];
    const detail = Object.values(details).find(value => value?.articleNumber === candidate.articleNumber);
    const identityVerified = Boolean(detail?.snapshot && detail.snapshot.articleNumber === candidate.articleNumber);
    const fitting = fittingDimensionCheck(input, [candidate.subtitle ?? detail?.subtitle ?? "", candidate.productName, ...candidate.specifications].join("\n"));
    const pipeDiameter = pipeHeaderDimensionCheck(input, detail?.subtitle ?? "");
    const dimensionMatch = materialDimensionMatch(input, candidate);
    const conflict = dimensionMatch.status === "mismatch" || pipeDiameter.conflict || fitting.conflict || candidate.technicalEvaluation?.status === "FAIL" || technicalConflictWarnings(candidate).length > 0;
    return [{ articleNumber: candidate.articleNumber, productName: candidate.productName, subtitle: candidate.subtitle ?? detail?.subtitle ?? "",
      productUrl, specifications: candidate.specifications.filter(item => item.trim()).slice(0, 30), identityVerified, conflict,
      dimensionMatch, ...materialCandidateScore(candidate, dimensionMatch, identityVerified, conflict),
      warnings: [...new Set([...(dimensionMatch.status === "mismatch" ? [dimensionMatch.explanation] : []), ...pipeDiameter.warnings, ...fitting.warnings, ...(candidate.matchWarnings ?? []), ...(candidate.technicalEvaluation?.checks.filter(check => check.status !== "MATCH").map(check => check.reason) ?? []),
        ...(!identityVerified ? ["Artikelnumret kunde inte verifieras på produktsidan. Du kan ändå välja produkten."] : [])])].filter(warning => !(dimensionMatch.status === "match" && materialDimensionKind(input) === "dn"
        && /^Produktens dimension saknas; PDF kräver DN\d/.test(warning))).map(warning => warning.replace(/PDF-kravet/g, "Materialkravet").replace(/PDF kräver/g, "Materiallistan kräver")) }];
  });
  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)
    || Number(a.conflict) - Number(b.conflict)
    || Number(b.dimensionMatch?.status === "match") - Number(a.dimensionMatch?.status === "match")
    || Number(b.identityVerified) - Number(a.identityVerified)
    || a.articleNumber.localeCompare(b.articleNumber));
  return { candidates, searchUrl: search.searchUrl, queries, partial: Boolean(search.failedQueries?.length) || candidates.some(candidate => !candidate.identityVerified),
    warnings: [...materialInputWarnings(input), ...(queries.length > 1 ? ["Sökningen använder även kortare produktnamn. Kontrollera dimension, anslutning och användningsområde mot materialraden."] : []), ...("message" in search && search.message ? [search.message] : []),
      ...(search.failedQueries?.length ? ["Sökningen blev ofullständig. Försök igen för att hämta fler uppgifter."] : [])] };
}

/** Prioritize matching sizes before spending six detail requests. */
function materialDimensionHint(input: MaterialSearchInput, candidate: AhlsellPublicCandidate) {
  const status = materialDimensionMatch(input, candidate).status;
  return status === "match" ? 2 : status === "mismatch" ? -1 : 0;
}

/** The exact pipe variant's diameter × wall heading also documents its outer size. */
export function pipeHeaderDimensionCheck(input: MaterialSearchInput, subtitle: string) {
  const requested = Number(input.dimension.replace(/\s*mm$/i, "").replace(",", "."));
  const diameter = /^\s*(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*mm\b/i.exec(subtitle)?.[1];
  const actual = diameter ? Number(diameter.replace(",", ".")) : null;
  const conflict = input.dimensionKind === "outside" && input.unit.toLowerCase() === "m" && !input.fittingDimension
    && requested > 0 && actual !== null && Math.abs(requested - actual) > 0.001;
  return { conflict, warnings: conflict ? [`Produktsidan anger rördiameter ${actual} mm, men materialraden kräver ${requested} mm.`] : [] };
}
