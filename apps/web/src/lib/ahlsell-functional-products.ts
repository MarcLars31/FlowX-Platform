import { mainProductText, normalizeTechnicalText, productRequirementAttributes } from "./ahlsell-requirement-context";
import type { AhlsellPublicCandidate, AhlsellRequirementGuide } from "./ahlsell-public-match";

export const ENERGY_VALVE_PATTERN = /\b(?:energiventil(?:er)?|energy valve)\b/;
export const CONTROL_VALVE_PATTERN = /\b(?:reguleringsventil(?:er)?|innreguleringsventil(?:er)?|reglerventil(?:er)?|control valve|balancing valve)\b/;

export function luminaireRequirements(requirement: Record<string, unknown>) {
  const attributes = productRequirementAttributes(requirement);
  const montage = normalizeTechnicalText(`${attributes.montering ?? ""} ${attributes.montasje ?? ""}`);
  const dimensions = String(attributes["armaturens mål"] ?? "").match(/L\s*(\d+)\s*[x×]\s*B\s*(\d+)/i);
  return { recessed: /\binnfelt\b/.test(montage), dali: /\bdali\b/i.test(String(attributes.styring ?? "")),
    linear: Boolean(dimensions && Number(dimensions[1]) > Number(dimensions[2]) * 4) };
}

export function assessLuminaireFeatures(requirement: ReturnType<typeof luminaireRequirements>, candidate: AhlsellPublicCandidate) {
  const text = normalizeTechnicalText([candidate.productName, candidate.description, ...candidate.specifications].join(" "));
  const warnings: string[] = [];
  const reasons: string[] = [];
  let score = 0;
  if (requirement.linear && /\b(?:downlight|plafond)\b/.test(mainProductText(candidate.productName))) {
    warnings.push("Fel produkttyp: PDF-posten anger en långsmal armatur, inte downlight eller plafond.");
  }
  if (requirement.recessed) {
    if (/\binnfelt(?:e)?\b/.test(text)) { score += 15; reasons.push("Produktfamiljen omfattar infällt montage; kontrollera artikelvarianten."); }
    else warnings.push("Infällt montage behöver verifieras för armaturen.");
  }
  if (requirement.dali) {
    if (/\bdali\b/.test(text) && !/\b(?:uten|ikke|utan|ej) dali\b/.test(text)) { score += 15; reasons.push("DALI anges för produktfamiljen; kontrollera artikelvarianten."); }
    else warnings.push("DALI-styrning behöver verifieras för armaturen.");
  }
  return { score, warnings, reasons };
}

export function isLuminaireProduct(name: string) {
  if (/\bfor (?:nod|reserve|romnings|ledelys|markerings)/.test(normalizeTechnicalText(name))) return false;
  const main = mainProductText(name);
  return /\b(?:lysarmatur(?:er)?|belysningsarmatur(?:er)?|takarmatur(?:er)?|led ?armatur(?:er)?|linjearmatur(?:er)?|downlight|plafond|luminaire)\b/.test(main)
    && !/\b(?:tilbehor|tillbehor|nodlys\w*|ledelys\w*|markeringslys\w*|dimmer|driver|forkobling|brakett|feste|oppheng|adapter|lyskilde|reservedel)\b/.test(main);
}

/** Retrieve a product family, never the project's component tag or NS heading. */
export function functionalProductGuide(requirement: Record<string, unknown>, intent: "luminaire" | "energy_valve" | "control_valve", searchBase: string, warnings: string[]): AhlsellRequirementGuide {
  const attributes = Object.entries(productRequirementAttributes(requirement));
  const attributeText = normalizeTechnicalText(attributes.map(([key, value]) => `${key} ${value}`).join(" "));
  const description = String(requirement.value_text ?? requirement.display_name ?? "");
  let queries: string[];
  if (intent === "luminaire") {
    const mount = /\binnfelt\b/.test(attributeText) ? "innfelt" : /\butenpaliggende|utenpa|patak\b/.test(attributeText) ? "utenpåliggende" : "";
    const control = /\bdali\b/.test(attributeText) ? "DALI" : /\bled\b/.test(attributeText) ? "LED" : "";
    queries = [["Takarmatur", mount, control].filter(Boolean).join(" "), "Lysarmatur", "LED armatur"];
  } else {
    const dimension = /\bDN\s*(\d+)\b/i.exec(`${description} ${attributes.filter(([key]) => /dimensjon|dimension/i.test(key)).map(([, value]) => value).join(" ")}`)?.[1];
    const dn = dimension ? ` DN${dimension}` : "";
    queries = intent === "energy_valve" ? [`Energiventil${dn}`, `Energy Valve${dn}`, "Energiventil"]
      : [`Reguleringsventil${dn}`, `Innreguleringsventil${dn}`];
  }
  const searchQueries = [...new Set(queries)];
  const url = new URL(searchBase);
  url.searchParams.set("parameters.SearchPhrase", searchQueries[0]);
  return { searchQuery: searchQueries[0], searchQueries, searchUrl: url.toString(),
    criteria: attributes.map(([key, value]) => `${key}: ${value}`), warnings, recognitionNotes: [], directCandidates: [] };
}

/** A family hit does not verify optical performance or an energy-valve assembly. */
export function functionalProductReviewWarnings(requirement: Record<string, unknown>, intent: "luminaire" | "energy_valve" | "control_valve") {
  const attributes = productRequirementAttributes(requirement);
  const fields = intent === "luminaire"
    ? ["montering", "armaturens mål", "lystekniske krav", "styring", "utforming av avskjerming foran lyskilde", "kapslingsgrad"]
    : ["funksjon", "databus-kommunikasjon", "nominell spenning", "temperaturområde", "reguleringsnøyaktighet"];
  const checks = fields.flatMap(key => attributes[key] ? [`${key}: ${attributes[key]}`] : []);
  return [intent === "luminaire"
    ? `Verifiera armaturens montage, mått, ljusflöde, optik och styrning mot PDF-posten${checks.length ? ` (${checks.join("; ")})` : ""}. En armaturträff verifierar inte rätt utförande.`
    : `Verifiera ventilens funktion, flödesområde, tryck, styrning och kompletta leveransomfattning${intent === "energy_valve" ? ", inklusive energimätning och temperatursensorer" : ""}${checks.length ? ` (${checks.join("; ")})` : ""}.`];
}
