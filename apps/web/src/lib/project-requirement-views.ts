import { isDistributorLumpSumRequirement, splitDistributorRequirementLines, type DistributorRequirementRow } from "./distributor-requirement-lines";

export const PROJECT_REQUIREMENT_VIEWS = [
  { id: "products", label: "Produktposter" },
  { id: "removal", label: "Demontering" },
  { id: "work", label: "Arbetsmoment" },
  { id: "rs", label: "RS-koder" }
] as const;

export type ProjectRequirementView = (typeof PROJECT_REQUIREMENT_VIEWS)[number]["id"];

/** Presentation groups keep every visible post in one table. RS remains work
 * for approval and export; removal keeps its operation-specific view. */
export function groupProjectRequirementViews<Row extends DistributorRequirementRow>(requirements: Row[]) {
  const { productRequirements, removalRequirements, workRequirements } = splitDistributorRequirementLines(requirements);
  return {
    products: productRequirements,
    removal: removalRequirements,
    work: workRequirements.filter(requirement => !isDistributorLumpSumRequirement(requirement)),
    rs: workRequirements.filter(isDistributorLumpSumRequirement)
  };
}
