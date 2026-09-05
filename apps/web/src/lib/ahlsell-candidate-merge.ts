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
  return orderAhlsellCandidatesForDisplay([...candidatesByArticle.values()]);
}

function mergeCandidate(
  verified: AhlsellPublicCandidate,
  live: AhlsellPublicCandidate
): AhlsellPublicCandidate {
  const hasVerifiedAssessment = verified.exactMatch !== undefined
    || verified.matchScore !== undefined
    || verified.matchReasons !== undefined
    || verified.matchWarnings !== undefined;
  return {
    ...live,
    ...verified,
    productName: richerText(live.productName, verified.productName),
    productUrl: live.productUrl || verified.productUrl,
    imageUrl: live.imageUrl ?? verified.imageUrl,
    description: live.description ?? verified.description,
    specifications: uniqueText([...verified.specifications, ...live.specifications]),
    source: verified.source,
    exactMatch: hasVerifiedAssessment ? verified.exactMatch : live.exactMatch,
    matchScore: hasVerifiedAssessment ? verified.matchScore : live.matchScore,
    matchReasons: hasVerifiedAssessment ? verified.matchReasons : live.matchReasons,
    matchWarnings: hasVerifiedAssessment ? verified.matchWarnings : live.matchWarnings,
    recommendation: hasVerifiedAssessment ? verified.recommendation : live.recommendation,
    familyCode: verified.familyCode ?? live.familyCode
  };
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
