import { parseQuantityNumber } from "./quantity-value";
import { isDistributorLumpSumRequirement, type DistributorRequirementRow } from "./distributor-requirement-lines";

export const PROJECT_REQUIREMENT_VIEWS = [
  { id: "products", label: "Produktposter" },
  { id: "removal", label: "Demontering" },
  { id: "rs", label: "Rund Sum" }
] as const;

export type ProjectRequirementView = (typeof PROJECT_REQUIREMENT_VIEWS)[number]["id"];

/** Presentation follows the post's own quantity, independently of its operation. */
export function groupProjectRequirementViews<Row extends DistributorRequirementRow>(requirements: Row[]) {
  const groups = { products: [] as Row[], removal: [] as Row[], work: [] as Row[], rs: [] as Row[] };
  for (const requirement of requirements) {
    if (["rejected", "superseded"].includes(String(requirement.status ?? ""))) continue;
    if (isDistributorLumpSumRequirement(requirement)) {
      groups.rs.push(requirement);
      continue;
    }
    const value = requirement.value_json as { quantity?: unknown } | null;
    const quantity = parseQuantityNumber(value?.quantity);
    const hasQuantity = quantity !== null && quantity >= 0;
    groups[hasQuantity ? "products" : "removal"].push(requirement);
  }
  return groups;
}
