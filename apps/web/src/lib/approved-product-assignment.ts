/**
 * A product is approved only after the user has explicitly approved it.
 * Suggested, prefilled, or merely selected products must never pass this check.
 */
export function isUserApprovedProductAssignment(
  assignment: unknown
) {
  const value = record(assignment);
  if (value.status !== "selected") return false;

  const snapshot = record(value.product_snapshot);
  return (
    snapshot.source === "distributor_manual" &&
    snapshot.approvedByUser === true &&
    snapshot.approvalStatus === "user_approved"
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
