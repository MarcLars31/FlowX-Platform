/** Products are stored together so a post is approved and revised atomically.
 * Legacy snapshots contain one product directly on the snapshot. */
export function productChoiceSnapshots(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const snapshot = value as Record<string, unknown>;
  const products = Array.isArray(snapshot.products) ? snapshot.products : [snapshot];
  return products.filter((item): item is Record<string, unknown> => Boolean(item)
    && typeof item === "object" && !Array.isArray(item)
    && typeof item.productNumber === "string" && Boolean(item.productNumber.trim()));
}
