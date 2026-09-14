import { buildAhlsellRequirementGuide } from "./ahlsell-public-match";
import { ahlsellMldlProduct, findAhlsellMldlCandidates } from "./ahlsell-mldl-catalog";
import { mergeAhlsellCandidates } from "./ahlsell-candidate-merge";
import { attachAhlsellAccessorySuggestions } from "./ahlsell-accessory-suggestions";

/** Automatic matching is local. Public Ahlsell lookup is a separate, user-triggered action. */
export function findMldlOnlyCandidates(requirement: Record<string, unknown>, limit = 50) {
  const guide = buildAhlsellRequirementGuide(requirement);
  const candidates = mergeAhlsellCandidates(guide.directCandidates, findAhlsellMldlCandidates(requirement, limit));
  return attachAhlsellAccessorySuggestions(requirement,
    candidates.filter(candidate => ahlsellMldlProduct(candidate.articleNumber)));
}
