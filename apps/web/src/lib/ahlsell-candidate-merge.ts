import { orderAhlsellCandidatesForDisplay } from "@/lib/ahlsell-candidate-ranking";
import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

/**
 * Combines the structured, verified database assessment with live Ahlsell
 * details. The verified assessment remains authoritative while live data may
 * enrich links, images and descriptions.
 */
export function mergeAhlsellCandidates(
  verifiedCandidates: readonly AhlsellPublicCandidate[],
  liveCandidates: readonly AhlsellPublicCandidate[]
) {
  const candidatesByArticle = new Map<string, AhlsellPublicCandidate>();
  for (const candidate of liveCandidates) {
    const key = normalizedArticle(candidate.articleNumber);
    if (key) candidatesByArticle.set(key, candidate);
  }
  for (const verified of verifiedCandidates) {
    const key = normalizedArticle(verified.articleNumber);
    if (!key) continue;
    const live = candidatesByArticle.get(key);
    candidatesByArticle.set(key, live ? mergeCandidate(verified, live) : verified);
  }
  return orderAhlsellCandidatesForDisplay(
    [...candidatesByArticle.values()].map(withInferredEvidence)
  );
}

function mergeCandidate(
  verified: AhlsellPublicCandidate,
  live: AhlsellPublicCandidate
): AhlsellPublicCandidate {
  const hasVerifiedAssessment = verified.exactMatch !== undefined
    || verified.matchScore !== undefined
    || verified.matchReasons !== undefined
    || verified.matchWarnings !== undefined;
  const evidenceSources = uniqueEvidence([
    ...(verified.evidenceSources ?? inferredEvidence(verified.source)),
    ...(live.evidenceSources ?? inferredEvidence(live.source))
  ]);
  const databaseAndPublic = evidenceSources.includes("mldl_database")
    && evidenceSources.includes("ahlsell_public");
  const warnings = hasVerifiedAssessment ? verified.matchWarnings : live.matchWarnings;
  const baseScore = hasVerifiedAssessment ? verified.matchScore : live.matchScore;
  const boostedScore = databaseAndPublic && typeof baseScore === "number"
    ? Math.min(100, baseScore + 8)
    : baseScore;
  const reasons = hasVerifiedAssessment ? verified.matchReasons : live.matchReasons;
  const matchReasons = databaseAndPublic
    ? uniqueText([...(reasons ?? []), "Artikeln finns i både Ahlsells MLDL-databas och den aktuella offentliga katalogen."])
    : reasons;
  const recommendation = boostedScore !== undefined && boostedScore >= 75 && (warnings?.length ?? 0) === 0
    ? "recommended" as const
    : hasVerifiedAssessment ? verified.recommendation : live.recommendation;
  return {
    ...live,
    ...verified,
    productName: richerText(live.productName, verified.productName),
    productUrl: live.productUrl || verified.productUrl,
    imageUrl: live.imageUrl ?? verified.imageUrl,
    description: live.description ?? verified.description,
    specifications: uniqueText([...verified.specifications, ...live.specifications]),
    source: verified.source,
    evidenceSources,
    exactMatch: hasVerifiedAssessment ? verified.exactMatch : live.exactMatch,
    matchScore: boostedScore,
    matchReasons,
    matchWarnings: warnings,
    recommendation,
    familyCode: verified.familyCode ?? live.familyCode
  };
}

function withInferredEvidence(candidate: AhlsellPublicCandidate): AhlsellPublicCandidate {
  return candidate.evidenceSources?.length
    ? candidate
    : { ...candidate, evidenceSources: inferredEvidence(candidate.source) };
}

function inferredEvidence(source: AhlsellPublicCandidate["source"]): NonNullable<AhlsellPublicCandidate["evidenceSources"]> {
  if (source === "structured_database") return ["mldl_database"];
  if (source === "verified_database") return ["mldl_database", "victaulic_verified"];
  if (source === "pdf_reference") return ["pdf_reference"];
  if (source === "confirmed_history") return ["confirmed_history"];
  return ["ahlsell_public"];
}

function uniqueEvidence(values: NonNullable<AhlsellPublicCandidate["evidenceSources"]>) {
  return [...new Set(values)];
}

function normalizedArticle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function richerText(left: string, right: string) {
  return left.trim().length > right.trim().length ? left : right;
}

function uniqueText(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
