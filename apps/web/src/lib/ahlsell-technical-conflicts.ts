import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

/** Confirmed incompatibilities rank below incomplete but plausible products. */
export function technicalConflictWarnings(candidate: Pick<AhlsellPublicCandidate, "matchWarnings">): string[] {
  return (candidate.matchWarnings ?? []).filter(warning => !/Databasvärdet saknas\./i.test(warning) && (
    /^(?:Fel (?:K-faktor|temperatur|dimension|böjvinkel|produkttyp|mätområde|ventilövervakning)|För lågt arbetstryck):/i.test(warning)
    || /^(?:Sprinklerns (?:responstid|monteringsriktning)|Färg eller ytfinish|Utlösningstemperaturen|Responstiden|Monteringsriktningen) stämmer inte/i.test(warning)
    || /^PDF-kravet anger .+, men träffen är (?:en |ett )?(?:dold|konventionell|torr|öppen)/i.test(warning)
    || /^Träffen är .+, inte /i.test(warning)
    || /^Fel täcknings-/i.test(warning)
    || /^(?:Produkten är (?:avsedd|endast dokumenterad) för .+, men PDF-kravet anger|Produktens (?:material|skarv- eller anslutningstyp) stämmer inte)/i.test(warning)
    || /^PDF-kravet .+, men (?:Ahlsell-träffen är utan fjäder|träffen är övervakad stängd|träffen har spak\/handtag|produktens montageutförande stämmer inte|träffen är inte en concealed-modell)/i.test(warning)
    || /^Tryckklass måste kontrolleras: PDF kräver PN\d+, träffen anger PN\d+/i.test(warning)
  ));
}

export function withTechnicalConflictAssessment(candidate: AhlsellPublicCandidate): AhlsellPublicCandidate {
  if (technicalConflictWarnings(candidate).length === 0) return candidate;
  return { ...candidate, exactMatch: false, recommendation: "unlikely",
    matchScore: Math.min(candidate.matchScore ?? 0, 34) };
}
