import type { AhlsellPublicCandidate } from "./ahlsell-public-match";
import { ahlsellCandidateMatchState } from "./ahlsell-candidate-ranking";

export type ProductSelectionReview = { status: "mismatch" | "review"; warnings: string[] };
export const PRODUCT_DEVIATION_LABEL = "Manuellt vald – avvikelse";
export const PRODUCT_REVIEW_LABEL = "Manuellt vald – kontroll krävs";

export function candidateSelectionReview(candidate?: AhlsellPublicCandidate): ProductSelectionReview | null {
  if (!candidate) return { status: "review", warnings: ["Produktens tekniska uppgifter behöver kontrolleras mot PDF-kravet."] };
  const state = ahlsellCandidateMatchState(candidate);
  if (state === "exact" || state === "matched") return null;
  return { status: state, warnings: candidate.matchWarnings?.length ? candidate.matchWarnings : [
    candidate.requiresAccessoryReview ? "Tillbehörskravet återstår att hantera." : "Underlaget räcker inte för att verifiera en match."
  ] };
}

/** A human-readable review note is saved atomically with both the choice and
 * its memory by the existing approval RPC, including on legacy deployments. */
export function productSelectionReviewNotes(review: ProductSelectionReview | null, previousNotes = "") {
  const previous = readProductSelectionReview(previousNotes);
  const notes = previous ? previousNotes.split("\n\n").slice(1).join("\n\n") : previousNotes;
  if (!review) return notes;
  const label = review.status === "mismatch" ? PRODUCT_DEVIATION_LABEL : PRODUCT_REVIEW_LABEL;
  const block = `${label}:\n${review.warnings.map(warning => `- ${warning.replace(/\s+/g, " ")}`).join("\n")}`;
  return [block, notes].filter(Boolean).join("\n\n").slice(0, 2000);
}

export function readProductSelectionReview(notes: unknown): ProductSelectionReview | null {
  if (typeof notes !== "string") return null;
  const status = notes.startsWith(`${PRODUCT_DEVIATION_LABEL}:\n`) ? "mismatch"
    : notes.startsWith(`${PRODUCT_REVIEW_LABEL}:\n`) ? "review" : null;
  if (!status) return null;
  return { status, warnings: notes.split("\n\n")[0].split("\n").slice(1).map(line => line.replace(/^- /, "")) };
}
