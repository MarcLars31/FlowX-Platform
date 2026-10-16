import { normalizeQuantityUnit, parseQuantityNumber } from "./quantity-value";
import { isDistributorLumpSumRequirement, type DistributorRequirementRow } from "./distributor-requirement-lines";

export const PROJECT_REQUIREMENT_VIEWS = [
  { id: "products", label: "Produktposter" },
  { id: "removal", label: "Prosjekt information" },
  { id: "rs", label: "Rund Sum" }
] as const;

export type ProjectRequirementView = (typeof PROJECT_REQUIREMENT_VIEWS)[number]["id"];

const quantityUnits = new Set(["st", "m", "m2", "m3", "kg", "l", "t", "tonn", "h", "time", "timer", "dag", "dager", "døgn", "sett", "par"]);

/** Only the post's own quantity and purchasing unit determine its table. */
export function groupProjectRequirementViews<Row extends DistributorRequirementRow>(requirements: Row[]) {
  const groups = { products: [] as Row[], removal: [] as Row[], work: [] as Row[], rs: [] as Row[] };
  for (const requirement of requirements) {
    if (["rejected", "superseded"].includes(String(requirement.status ?? ""))) continue;
    if (isDistributorLumpSumRequirement(requirement)) {
      groups.rs.push(requirement);
      continue;
    }
    const value = requirement.value_json as { quantity?: unknown; unit?: unknown; reviewFlags?: unknown } | null;
    const quantity = parseQuantityNumber(value?.quantity);
    const hasQuantity = quantity !== null && quantity >= 0;
    const hasUnit = quantityUnits.has(normalizeQuantityUnit(value?.unit));
    const information = Array.isArray(value?.reviewFlags) && value.reviewFlags.includes("project-information");
    groups[hasQuantity && hasUnit && !information ? "products" : "removal"].push(requirement);
  }
  return groups;
}
