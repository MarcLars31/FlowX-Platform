import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";
import { ahlsellCandidateMatchState, isMatchingAhlsellCandidate } from "./ahlsell-candidate-ranking";

export const MAX_VISIBLE_AHLSELL_CANDIDATES = 3;

export function normalizeNrfNumber(value: string) {
  return value.trim().toLocaleLowerCase("sv-SE").replace(/[^a-z0-9]/g, "").replace(/^nrf/, "");
}

export function filterAhlsellCandidatesByNrf(
  candidates: AhlsellPublicCandidate[],
  nrfNumber: string
) {
  const normalizedNrfNumber = normalizeNrfNumber(nrfNumber);
  if (!normalizedNrfNumber) return candidates;

  return candidates.filter((candidate) =>
    normalizeNrfNumber(candidate.articleNumber).includes(normalizedNrfNumber)
  );
}

export function topAhlsellCandidates(candidates: AhlsellPublicCandidate[]) {
  return candidates.slice(0, MAX_VISIBLE_AHLSELL_CANDIDATES);
}

export function groupAhlsellCandidatesForDisplay(candidates: AhlsellPublicCandidate[], allowMatches = true) {
  const matching = candidates.filter(candidate => allowMatches && isMatchingAhlsellCandidate(candidate));
  const matchingSet = new Set(matching);
  const other = candidates.filter(candidate => !matchingSet.has(candidate));
  const rejected = other.filter(candidate => ahlsellCandidateMatchState(candidate) === "mismatch");
  const review = other.filter(candidate => ahlsellCandidateMatchState(candidate) !== "mismatch");
  return { matching, other, visibleOther: topAhlsellCandidates(other), rejected, review };
}
