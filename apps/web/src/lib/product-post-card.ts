import { isUserApprovedProductAssignment } from "./approved-product-assignment";
import type { AhlsellLookupProduct } from "./ahlsell-product-lookup";

export type ProductPostCardStatus = "empty" | "review" | "approved" | "excluded";
export function productPostCardStatus(assignment: unknown, hasDraft: boolean, excluded = false): ProductPostCardStatus {
  if (hasDraft) return "review";
  if (isUserApprovedProductAssignment(assignment)) return "approved";
  return excluded ? "excluded" : "empty";
}

/** A search score cannot prove a dimension. Keep uncertain or conflicting
 * variants out of automatic proposals; each proposal still needs approval. */
export function dimensionMatchedSeriesProducts(products: readonly AhlsellLookupProduct[]) {
  return [...new Map(products.filter(product => {
    const evaluation = product.technicalEvaluation;
    if (!evaluation || evaluation.status === "FAIL") return false;
    const dimensions = evaluation.checks.filter(check => ["dn", "outsideDiameterMm", "width", "height", "length"].includes(check.property));
    return dimensions.length > 0 && dimensions.every(check => check.status === "MATCH")
      && !evaluation.checks.some(check => check.mandatory && check.status === "FAIL");
  }).map(product => [product.articleNumber, product])).values()];
}
