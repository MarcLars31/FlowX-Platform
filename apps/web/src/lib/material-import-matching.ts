import { assessAhlsellLookupCandidates } from "./ahlsell-hybrid-matching";
import { lookupAhlsellProduct } from "./ahlsell-product-lookup";
import { searchAhlsellPublicCatalogQueries } from "./ahlsell-public-catalog";
import { applyAhlsellProductDetails, fetchAhlsellProductDetails, safeAhlsellProductUrl } from "./ahlsell-product-subtitle";
import { technicalConflictWarnings } from "./ahlsell-technical-conflicts";
import type { AhlsellEvidenceStore } from "./ahlsell-technical-evidence";
import { materialInputWarnings, materialSearchQuery, type MaterialCandidate, type MaterialSearchInput, type MaterialSearchResult } from "./material-import";

export function materialRequirement(input: MaterialSearchInput): Record<string, unknown> {
  const attributes: Record<string, string> = {};
  if (/\b(?:kobber|koppar)/i.test(input.description)) attributes.Materiale = "Kobber";
  else if (/\b(?:rustfri|syrefast)/i.test(input.description)) attributes.Materiale = "Rustfritt stål";
  const pipe = /^r[øö]r\b/i.test(input.category) && input.unit.toLowerCase() === "m";
  if (pipe) attributes["Type produkt"] = "Rør";
  // A bare dimension in a material schedule is not evidence of DN.
  if (input.dimensionKind === "dn" && /^\s*(?:DN\s*)?\d+(?:[.,]\d+)?\s*$/i.test(input.dimension)) attributes.DN = input.dimension.replace(/^\s*DN\s*/i, "");
  if (input.dimensionKind === "outside" && /^\s*\d+(?:[.,]\d+)?\s*(?:mm)?\s*$/i.test(input.dimension)) attributes["Ytterdiameter"] = input.dimension.replace(/\s*mm\s*$/i, "") + " mm";
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
  const exact = /^\d{6,12}$/.test(query) || /^https:\/\//i.test(query);
  const search = exact
    ? await (dependencies.lookup ?? lookupAhlsellProduct)({ query, market: "no", fetchImpl, signal, store }).then(result => ({ candidates: result.products, searchUrl: result.searchUrl, failedQueries: [] as string[], message: result.message }))
    : await (dependencies.search ?? searchAhlsellPublicCatalogQueries)({ market: "no", queries: [query], fetchImpl, maxCandidates: 24, maxPages: 1, maxVariantFamilies: 3 });
  const requirement = materialRequirement(input);
  const ranked = assessAhlsellLookupCandidates(requirement, search.candidates);
  const details = await (dependencies.details ?? fetchAhlsellProductDetails)({ items: ranked.slice(0, 6), fetchImpl, signal, store });
  signal?.throwIfAborted();
  const enriched = ranked.slice(0, 6).map(candidate => applyAhlsellProductDetails(candidate, details[candidate.articleNumber]));
  const evaluated = assessAhlsellLookupCandidates(requirement, enriched);
  const dimensionScores = new Map<string, number>();
  const candidates: MaterialCandidate[] = evaluated.flatMap(candidate => {
    const productUrl = safeAhlsellProductUrl(candidate.productUrl);
    if (!productUrl || !new URL(productUrl).hostname.endsWith(".no")) return [];
    const detail = Object.values(details).find(value => value?.articleNumber === candidate.articleNumber);
    const identityVerified = Boolean(detail?.snapshot && detail.snapshot.articleNumber === candidate.articleNumber);
    const fitting = fittingDimensionCheck(input, [candidate.subtitle ?? detail?.subtitle ?? "", candidate.productName, ...candidate.specifications].join("\n"));
    const pipeDiameter = pipeHeaderDimensionCheck(input, detail?.subtitle ?? "");
    const requested = input.dimension.replace(/^DN\s*/i, "").replace(/\s*mm$/i, "").trim();
    const documentedDimensions = [candidate.technicalEvidence?.fields.dn, candidate.technicalEvidence?.fields.outsideDiameterMm]
      .flatMap(field => field?.status === "documented" ? field.observations.map(observation => Number(observation.value)) : []);
    const dimensionMatches = /^\d+(?:[.,]\d+)?$/.test(requested) && documentedDimensions.includes(Number(requested.replace(",", ".")));
    dimensionScores.set(candidate.articleNumber, fitting.matches || dimensionMatches ? 1 : 0);
    const conflict = pipeDiameter.conflict || fitting.conflict || candidate.technicalEvaluation?.status === "FAIL" || technicalConflictWarnings(candidate).length > 0;
    return [{ articleNumber: candidate.articleNumber, productName: candidate.productName, subtitle: candidate.subtitle ?? detail?.subtitle ?? "",
      productUrl, specifications: candidate.specifications.slice(0, 30), identityVerified, conflict,
      warnings: [...new Set([...pipeDiameter.warnings, ...fitting.warnings, ...(candidate.matchWarnings ?? []), ...(candidate.technicalEvaluation?.checks.filter(check => check.status !== "MATCH").map(check => check.reason) ?? []),
        ...(!identityVerified ? ["Artikelnumret kunde inte verifieras på produktsidan. Sök igen innan du väljer produkten."] : [])])].map(warning => warning.replace(/PDF-kravet/g, "Materialkravet").replace(/PDF kräver/g, "Materiallistan kräver")) }];
  });
  candidates.sort((a, b) => Number(a.conflict) - Number(b.conflict) || Number(b.identityVerified) - Number(a.identityVerified)
    || (dimensionScores.get(b.articleNumber) ?? 0) - (dimensionScores.get(a.articleNumber) ?? 0));
  return { candidates, searchUrl: search.searchUrl, partial: Boolean(search.failedQueries?.length) || candidates.some(candidate => !candidate.identityVerified),
    warnings: [...materialInputWarnings(input), ...("message" in search && search.message ? [search.message] : []),
      ...(search.failedQueries?.length ? ["Sökningen blev ofullständig. Försök igen för att hämta fler uppgifter."] : [])] };
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

/** A reduction or tee needs all connection sizes, not just one matching diameter. */
export function fittingDimensionCheck(input: MaterialSearchInput, text: string) {
  const expected = input.fittingDimension.replace(/\s*(?:mm|dn)\s*/gi, "").trim();
  if (!/^\d+(?:[.,]\d+)?(?:\s*[-x×]\s*\d+(?:[.,]\d+)?){1,2}$/i.test(expected)) return { conflict: false, matches: false, warnings: [] as string[] };
  const values = (value: string) => (value.match(/\d+(?:[.,]\d+)?/g) ?? []).map(number => Number(number.replace(",", "."))).sort((a, b) => a - b).join("/");
  const tuples = [...text.matchAll(/\b\d+(?:[.,]\d+)?\s*(?:mm)?\s*(?:[x×-]\s*\d+(?:[.,]\d+)?\s*(?:mm)?\s*){1,2}/gi)].map(match => match[0]);
  const matching = tuples.some(tuple => values(tuple) === values(expected));
  // Without a stated measure system a numerical difference cannot establish a conflict.
  const conflict = input.dimensionKind === "outside" && tuples.length > 0 && !matching;
  const warnings = conflict ? [`Kopplingens mått stämmer inte med ${input.fittingDimension}.`]
    : [matching ? "Kontrollera kopplingens portordning, vinkel och anslutningsutförande." : `Alla anslutningsmått (${input.fittingDimension}) kunde inte verifieras. Kontrollera produktbladet.`];
  return { conflict, matches: matching, warnings };
}
