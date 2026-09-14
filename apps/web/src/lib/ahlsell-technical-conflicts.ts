import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

/** Confirmed incompatibilities rank below incomplete but plausible products. */
export function technicalConflictWarnings(candidate: AhlsellPublicCandidate): string[] {
  return (candidate.matchWarnings ?? []).filter(warning =>
    /^(?:Fel (?:K-faktor|temperatur|dimension|böjvinkel|produkttyp)|För lågt arbetstryck):/i.test(warning)
    || /^(?:Sprinklerns (?:responstid|monteringsriktning)|Färg eller ytfinish|Utlösningstemperaturen|Responstiden|Monteringsriktningen) stämmer inte/i.test(warning)
    || /^PDF-kravet anger .+, men träffen är (?:en |ett )?(?:dold|konventionell|torr|öppen)/i.test(warning)
    || /^Träffen är .+, inte /i.test(warning)
    || /^Fel täcknings-/i.test(warning)
  );
}

export function withTechnicalConflictAssessment(candidate: AhlsellPublicCandidate): AhlsellPublicCandidate {
  if (technicalConflictWarnings(candidate).length === 0) return candidate;
  return { ...candidate, exactMatch: false, recommendation: "unlikely",
    matchScore: Math.min(candidate.matchScore ?? 0, 34) };
}
