import { isUserApprovedProductAssignment } from "@/lib/approved-product-assignment";

export const GUIDED_PROJECT_STEPS = [
  { id: "documents", label: "Ladda upp", tab: "documents" },
  { id: "products", label: "Välj produkter", tab: "products" },
  { id: "result", label: "Klart", tab: "overview" }
] as const;

export type GuidedProjectStepId = (typeof GUIDED_PROJECT_STEPS)[number]["id"];
export type GuidedProjectTab = (typeof GUIDED_PROJECT_STEPS)[number]["tab"];

type WorkflowRequirement = {
  id: string;
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

const excludedStatuses = new Set(["rejected", "superseded"]);

export function guidedProjectWorkflow(input: {
  documentCount: number;
  requirements: WorkflowRequirement[];
  assignments: WorkflowAssignment[];
}): GuidedProjectWorkflow {
  const visibleRequirements = input.requirements.filter(
    (requirement) => !excludedStatuses.has(String(requirement.status ?? ""))
  );
  const eligibleRequirements = visibleRequirements.filter(
    (requirement) => requirementOperation(requirement) !== "remove"
  );
  const mappedRequirementIds = new Set(
    input.assignments.flatMap((assignment) => {
      return isUserApprovedProductAssignment(assignment) &&
        typeof assignment.requirement_id === "string"
        ? [assignment.requirement_id]
        : [];
    })
  );
  const mappedRequirementCount = eligibleRequirements.filter((requirement) =>
    mappedRequirementIds.has(requirement.id)
  ).length;
  const productsComplete =
    visibleRequirements.length > 0 &&
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

function requirementOperation(requirement: WorkflowRequirement) {
  return String(record(requirement.value_json).operation ?? "install").toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
