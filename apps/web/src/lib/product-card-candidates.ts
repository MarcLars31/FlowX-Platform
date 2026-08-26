import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

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
