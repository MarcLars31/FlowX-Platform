import data from "@/data/sprinkler-reference-products.json";
import { rankAhlsellCandidates } from "./ahlsell-candidate-ranking";
import { ahlsellRequirementIntent } from "./ahlsell-requirement-intent";
import { productRequirementAttributes, productSearchHeading, normalizeTechnicalText } from "./ahlsell-requirement-context";
import { parseAhlsellNominalDiameter } from "./ahlsell-technical-evidence";
import { technicalConflictWarnings } from "./ahlsell-technical-conflicts";
import { hasSprinklerContext } from "./sprinkler-requirement-context";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

/** Public article identities only. Refresh the exact article before returning a
 * candidate; this index never supplies technical evidence or match points. */
export function sprinklerReferenceSearchHints(requirement: Record<string, unknown>): string[] {
  if (!hasSprinklerContext(requirement)) return [];
  const intent = ahlsellRequirementIntent(requirement);
  if (!["bend", "tee", "reducer", "cap", "coupling", "sprinkler_head"].includes(intent)) return [];
  const attributes = productRequirementAttributes(requirement);
  const heading = productSearchHeading(requirement);
  const normalized = normalizeTechnicalText(heading);
  // Assemblies and substitutes need their own reviewed component decisions.
  if (/\b(?:kryss|cross|vannskjerm|vattenskarm|water shield|beskyttelseskurv|beskyttelsesgitter)\b/.test(normalized)) return [];
  const dnText = Object.entries(attributes).find(([key]) => /^(?:dn|nominell diameter)$/.test(normalizeTechnicalText(key)))?.[1];
  const dn = typeof dnText === "number" ? dnText : typeof dnText === "string" ? parseAhlsellNominalDiameter(dnText) : null;
  const headingDn = [...heading.matchAll(/\bDN\s*(\d+(?:[.,]\d+)?)/gi)].map(match => Number(match[1].replace(",", ".")));
  const requiredDn = dn ?? (headingDn.length === 1 ? headingDn[0] : null);
  const tuple = Object.entries(attributes).find(([key]) => normalizeTechnicalText(key) === "fittingdimensjon dn")?.[1];
  const requiredPorts = typeof tuple === "string" && /^\d+(?:\s*[-x×]\s*\d+){1,2}$/.test(tuple)
    ? tuple.match(/\d+/g)!.map(Number) : null;
  if (intent === "sprinkler_head") {
    // A family name alone must not prefer the historical colour/temperature.
    if (!/\bk\s*\d+\b/i.test(heading) || !/\b(?:QR|SR)\b/i.test(heading)
      || !/\b\d+\s*(?:grader|°|C\b)/i.test(heading)
      || !/\b(?:SSP|SSU|HSW|oppadrettet|nedadrettet|sidewall|upright|pendent)\b/i.test(heading)
      || /\b(?:torrhode|torr|dry)\b/.test(normalized)) return [];
  } else if (requiredDn === null && !requiredPorts) return [];
  const candidates = data.products.flatMap((product): AhlsellPublicCandidate[] => {
    const text = `${product.productName} ${product.subtitle}`;
    if (intent === "sprinkler_head" && /\b(?:torr|dry)\b/.test(normalizeTechnicalText(text))) return [];
    if (ahlsellRequirementIntent({ value_text: text }) !== intent) return [];
    // Cap and male plug are not interchangeable. Neither is a rigid and flexible coupling.
    if (intent === "cap" && /\bplugg\b/.test(normalizeTechnicalText(text)) !== /\bplugg\b/.test(normalized)) return [];
    if (intent === "coupling" && /\b(?:fleksibel|flexibel|flexible)\b/.test(normalized)
      && /\b(?:fast|stiv|rigid)\b/.test(normalizeTechnicalText(text))) return [];
    const ports = product.specifications.filter(spec => /^Nominell diameter/i.test(spec))
      .map(spec => parseAhlsellNominalDiameter(spec.split(":").slice(1).join(":"))).filter((value): value is number => value !== null);
    if (requiredPorts && (ports.length !== requiredPorts.length || !ports.every((port, index) => port === requiredPorts[index]))) return [];
    if (!requiredPorts && intent !== "sprinkler_head" && (!ports.length || !ports.every(port => port === requiredDn))) return [];
    return [{ articleNumber: product.articleNumber, productName: text, manufacturer: "", productUrl: product.productUrl,
      specifications: product.specifications, source: "catalog_search" }];
  });
  return rankAhlsellCandidates(requirement, candidates)
    .filter(candidate => technicalConflictWarnings(candidate).length === 0 && (candidate.matchScore ?? 0) >= 60)
    .slice(0, 2).map(candidate => candidate.articleNumber);
}
