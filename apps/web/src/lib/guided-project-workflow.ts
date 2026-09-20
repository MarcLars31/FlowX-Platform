import { isUserApprovedProductAssignment } from "@/lib/approved-product-assignment";
import { isProductRequirementResolvedWithoutProduct } from "@/lib/product-requirement-resolution";
import { splitDistributorRequirementLines, type DistributorRequirementRow } from "@/lib/distributor-requirement-lines";

export const GUIDED_PROJECT_STEPS = [
  { id: "documents", label: "Ladda upp", tab: "documents" },
  { id: "products", label: "Välj produkter", tab: "products" },
  { id: "result", label: "Klart", tab: "overview" }
] as const;

export type GuidedProjectStepId = (typeof GUIDED_PROJECT_STEPS)[number]["id"];
export type GuidedProjectTab = (typeof GUIDED_PROJECT_STEPS)[number]["tab"];

type WorkflowRequirement = DistributorRequirementRow & {
  status?: unknown;
  value_json?: unknown;
};

type WorkflowAssignment = {
  id: string;
  requirement_id?: unknown;
  status?: unknown;
  product_snapshot?: unknown;
};

export type GuidedProjectWorkflow = {
  nextTab: GuidedProjectTab;
  nextLabel: string;
  isComplete: boolean;
  pendingRequirementCount: number;
  confirmedRequirementCount: number;
  eligibleRequirementCount: number;
  mappedRequirementCount: number;
  remainingProductCount: number;
  completedStepIds: GuidedProjectStepId[];
};

export function guidedProjectCompletionUpdate(
  workflow: Pick<GuidedProjectWorkflow, "isComplete">
) {
  return workflow.isComplete
    ? ({ currentStage: "completed", status: "proposal_ready" } as const)
    : null;
}

export function guidedProjectWorkflow(input: {
  documentCount: number;
  requirements: WorkflowRequirement[];
  assignments: WorkflowAssignment[];
}): GuidedProjectWorkflow {
  // Completion must use the same purchasable rows as the product picker.
  // Work and removal posts stay in the project but do not need a product.
  const { productRequirements: eligibleRequirements, removalRequirements, workRequirements } =
    splitDistributorRequirementLines(input.requirements);
  const visibleRequirementCount = eligibleRequirements.length + removalRequirements.length + workRequirements.length;
  const mappedRequirementIds = new Set(
    input.assignments.flatMap((assignment) => {
      return isUserApprovedProductAssignment(assignment) &&
        typeof assignment.requirement_id === "string"
        ? [assignment.requirement_id]
        : [];
    })
  );
  const mappedRequirementCount = eligibleRequirements.filter((requirement) =>
    mappedRequirementIds.has(requirement.id) ||
    isProductRequirementResolvedWithoutProduct(requirement)
  ).length;
  const productsComplete =
    visibleRequirementCount > 0 &&
    mappedRequirementCount === eligibleRequirements.length;

  const completedStepIds: GuidedProjectStepId[] = [];
  if (input.documentCount > 0) completedStepIds.push("documents");
  if (productsComplete) completedStepIds.push("products", "result");

  if (input.documentCount === 0 && input.requirements.length === 0) {
    return result("documents", "Ladda upp teknisk beskrivning", false);
  }
  if (!productsComplete) {
    return result("products", "Registrera Ahlsells produktval", false);
  }
  return result("products", "Produktvalet är klart", true);

  function result(
    nextTab: GuidedProjectTab,
    nextLabel: string,
    isComplete: boolean
  ): GuidedProjectWorkflow {
    return {
      nextTab,
      nextLabel,
      isComplete,
      pendingRequirementCount: 0,
      confirmedRequirementCount: eligibleRequirements.length,
      eligibleRequirementCount: eligibleRequirements.length,
      mappedRequirementCount,
      remainingProductCount: Math.max(
        eligibleRequirements.length - mappedRequirementCount,
        0
      ),
      completedStepIds
    };
  }
}

export function isGuidedProjectTab(value: unknown): value is GuidedProjectTab {
  return GUIDED_PROJECT_STEPS.some((step) => step.tab === value);
}
