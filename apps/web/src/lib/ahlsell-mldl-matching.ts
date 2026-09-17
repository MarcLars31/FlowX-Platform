import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { ahlsellMldlProduct, findAhlsellMldlCandidates } from "./ahlsell-mldl-catalog";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";
import { attachAhlsellAccessorySuggestions } from "./ahlsell-accessory-suggestions";
import { distributorRequirementKind } from "./distributor-requirement-lines";

/** Local evidence for the automatic search, which also queries Ahlsell's website. */
export function findMldlOnlyCandidates(requirement: Record<string, unknown>, limit = 50) {
  if (distributorRequirementKind({ ...requirement, id: String(requirement.id ?? "") }) !== "product") return [];
  const guide = buildAhlsellRequirementGuide(requirement);
  const candidates = mergeAhlsellCandidates(guide.directCandidates, findAhlsellMldlCandidates(requirement, limit));
  return attachAhlsellAccessorySuggestions(requirement,
    candidates.filter(candidate => ahlsellMldlProduct(candidate.articleNumber)));
}
