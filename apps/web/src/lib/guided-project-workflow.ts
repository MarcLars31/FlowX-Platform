export const GUIDED_PROJECT_STEPS = [
  { id: "project", label: "Projekt", tab: "overview" },
  { id: "documents", label: "Underlag", tab: "documents" },
  { id: "requirements", label: "Kravgranskning", tab: "requirements" },
  { id: "products", label: "Produktval", tab: "products" }
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

const reviewedStatuses = new Set([
  "user_confirmed",
  "user_modified",
  "rejected",
  "superseded"
]);

const confirmedStatuses = new Set(["user_confirmed", "user_modified"]);

export function guidedProjectWorkflow(input: {
  documentCount: number;
  requirements: WorkflowRequirement[];
  assignments: WorkflowAssignment[];
}): GuidedProjectWorkflow {
  const pendingRequirementCount = input.requirements.filter(
    (requirement) => !reviewedStatuses.has(String(requirement.status ?? ""))
  ).length;
  const confirmedRequirements = input.requirements.filter(
    (requirement) =>
      confirmedStatuses.has(String(requirement.status ?? "")) &&
      requirementOperation(requirement) !== "remove"
  );
  const mappedRequirementIds = new Set(
    input.assignments.flatMap((assignment) => {
      const snapshot = record(assignment.product_snapshot);
      return assignment.status === "selected" &&
        snapshot.source === "distributor_manual" &&
        typeof assignment.requirement_id === "string"
        ? [assignment.requirement_id]
        : [];
    })
  );
  const mappedRequirementCount = confirmedRequirements.filter((requirement) =>
    mappedRequirementIds.has(requirement.id)
  ).length;
  const requirementsComplete =
    input.requirements.length > 0 && pendingRequirementCount === 0;
  const productsComplete =
    confirmedRequirements.length > 0 &&
    mappedRequirementCount === confirmedRequirements.length;

  const completedStepIds: GuidedProjectStepId[] = ["project"];
  if (input.documentCount > 0) completedStepIds.push("documents");
  if (requirementsComplete) completedStepIds.push("requirements");
  if (productsComplete) completedStepIds.push("products");

  if (input.documentCount === 0 && input.requirements.length === 0) {
    return result("documents", "Ladda upp teknisk beskrivning", false);
  }
  if (input.requirements.length === 0 || pendingRequirementCount > 0) {
    return result("requirements", "Granska och godkänn kraven", false);
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
      pendingRequirementCount,
      confirmedRequirementCount: confirmedRequirements.length,
      eligibleRequirementCount: confirmedRequirements.length,
      mappedRequirementCount,
      remainingProductCount: Math.max(
        confirmedRequirements.length - mappedRequirementCount,
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
