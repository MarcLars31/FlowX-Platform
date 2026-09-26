import { isDistributorLumpSumRequirement, splitDistributorRequirementLines, type DistributorRequirementRow } from "./distributor-requirement-lines";

export const PROJECT_REQUIREMENT_VIEWS = [
  { id: "products", label: "Produktposter" },
  { id: "removal", label: "Demontering" },
  { id: "rs", label: "Rund Sum" }
] as const;

export type ProjectRequirementView = (typeof PROJECT_REQUIREMENT_VIEWS)[number]["id"];

/** Keep work posts in the data for approval and export even without a tab.
 * RS and removal retain their own presentation groups. */
export function groupProjectRequirementViews<Row extends DistributorRequirementRow>(requirements: Row[]) {
  const { productRequirements, removalRequirements, workRequirements } = splitDistributorRequirementLines(requirements);
  return {
    products: productRequirements,
    removal: removalRequirements,
    work: workRequirements.filter(requirement => !isDistributorLumpSumRequirement(requirement)),
    rs: workRequirements.filter(isDistributorLumpSumRequirement)
  };
}
