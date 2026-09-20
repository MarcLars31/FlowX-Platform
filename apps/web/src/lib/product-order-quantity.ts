export type ProductOrderQuantity = { quantity: number; unit: string };

// Quantities belong to this PDF post; they must never be learned as a
// per-product accessory ratio or multiplied by the PDF length at export.
export function parseProductOrderQuantity(value: unknown): ProductOrderQuantity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const quantity = parseProductQuantity(input.quantity);
  const unit = typeof input.unit === "string" ? input.unit.trim() : "";
  if (quantity === null || !unit || unit.length > 30) return null;
  return { quantity, unit };
}

export function parseProductQuantity(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const quantity = typeof value === "number" ? value : Number(value.trim().replace(",", "."));
  return Number.isFinite(quantity) && quantity >= 0.001 && quantity <= 100000 ? quantity : null;
}
