export type ProjectRequirementQuantity = {
  quantity: number | null;
  unit: string;
};

export function projectRequirementQuantity(
  valueJson: unknown
): ProjectRequirementQuantity {
  const value = record(valueJson);
  const parsed = typeof value.quantity === "number"
    ? value.quantity
    : Number(value.quantity);
  const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  const unit = typeof value.unit === "string" && value.unit.trim()
    ? value.unit.trim().slice(0, 30)
    : "st";

  return { quantity, unit };
}

export function formatProjectQuantity({
  quantity,
  unit
}: ProjectRequirementQuantity) {
  if (quantity === null) return "Antal saknas";
  return `${new Intl.NumberFormat("sv-SE", {
    maximumFractionDigits: 3
  }).format(quantity)} ${unit}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
