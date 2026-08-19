export type DistributorRequirementRow = Record<string, unknown> & { id: string };

const hiddenStatuses = new Set(["rejected", "superseded"]);

export function splitDistributorRequirementLines<
  Row extends DistributorRequirementRow
>(requirements: Row[]) {
  const visibleRequirements = requirements.filter(
    (requirement) => !hiddenStatuses.has(String(requirement.status ?? ""))
  );

  return {
    productRequirements: visibleRequirements.filter(
      (requirement) => distributorRequirementOperation(requirement) !== "remove"
    ),
    removalRequirements: visibleRequirements.filter(
      (requirement) => distributorRequirementOperation(requirement) === "remove"
    )
  };
}

export function distributorRequirementOperation(
  requirement: DistributorRequirementRow
) {
  return String(record(requirement.value_json).operation ?? "install").toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
