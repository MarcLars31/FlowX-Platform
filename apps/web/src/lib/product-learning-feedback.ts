import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import { ahlsellCandidateMatchState, type AhlsellCandidateMatchState } from "@/lib/ahlsell-candidate-ranking";

export const MAX_RECORDED_PRODUCT_CANDIDATES = 3;
export const PRODUCT_MATCHING_ENGINE_VERSION = "technical-rules-2026-09-05.5";

export type ProductLearningCandidateSnapshot = {
  rank: number;
  articleNumber: string;
  productName: string;
  manufacturer: string;
  description: string | null;
  specifications: string[];
  source: AhlsellPublicCandidate["source"];
  recommendation: AhlsellPublicCandidate["recommendation"] | null;
  matchScore: number | null;
  matchReasons: string[];
  matchWarnings: string[];
  exactMatch: boolean;
  matchState: AhlsellCandidateMatchState;
  familyCode: string | null;
  learningEvidence: {
    kind: "similar_confirmed";
    supportCount: number;
    similarityScore: number;
  } | null;
};

/**
 * Keeps the feedback payload small and deterministic. The order is the order
 * shown to the reviewer, which is important when this data is later used to
 * evaluate or train a product ranker.
 */
export function productLearningCandidateSnapshots(
  candidates: readonly AhlsellPublicCandidate[]
): ProductLearningCandidateSnapshot[] {
  return candidates
    .slice(0, MAX_RECORDED_PRODUCT_CANDIDATES)
    .map((candidate, index) => ({
      rank: index + 1,
      articleNumber: cleanText(candidate.articleNumber, 120),
      productName: cleanText(candidate.productName, 240),
      manufacturer: cleanText(candidate.manufacturer, 200),
      description: cleanOptionalText(candidate.description, 1000),
      specifications: cleanTextList(candidate.specifications, 20, 300),
      source: candidate.source,
      recommendation: candidate.recommendation ?? null,
      matchScore: finiteScore(candidate.matchScore),
      matchReasons: cleanTextList(candidate.matchReasons, 20, 500),
      matchWarnings: cleanTextList(candidate.matchWarnings, 20, 500),
      exactMatch: candidate.exactMatch === true,
      matchState: ahlsellCandidateMatchState(candidate),
      familyCode: cleanOptionalText(candidate.familyCode, 120),
      learningEvidence: cleanLearningEvidence(candidate.learningEvidence)
    }))
    .filter((candidate) => candidate.articleNumber.length > 0);
}

function cleanOptionalText(value: unknown, maxLength: number) {
  const cleaned = cleanText(value, maxLength);
  return cleaned || null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanTextList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function finiteScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function cleanLearningEvidence(value: AhlsellPublicCandidate["learningEvidence"]) {
  if (!value) return null;
  return {
    kind: value.kind,
    supportCount: Math.max(0, Math.floor(value.supportCount)),
    similarityScore: finiteScore(value.similarityScore) ?? 0
  };
}
