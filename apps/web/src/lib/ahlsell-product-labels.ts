import { isUuid } from "@/lib/distributor-product-mapping";
import { normalizeNrfNumber } from "@/lib/product-card-candidates";

export const MAX_AHLSELL_PRODUCT_LABEL_ITEMS = 30;

export type AhlsellProductLabelItem = {
  requirementId: string;
  articleNumber: string;
};

export type AhlsellProductLabel = {
  articleNumber: string;
  productName: string;
  subtitle: string;
  manufacturer: string;
  productUrl: string;
};

export function validateAhlsellProductLabelItems(
  value: unknown
): { data: AhlsellProductLabelItem[] } | { error: string } {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return { error: "Produktlistan har ogiltigt format." };
  }
  if (value.items.length === 0 || value.items.length > MAX_AHLSELL_PRODUCT_LABEL_ITEMS) {
    return { error: `Välj mellan 1 och ${MAX_AHLSELL_PRODUCT_LABEL_ITEMS} produkter.` };
  }

  const items: AhlsellProductLabelItem[] = [];
  const requirementIds = new Set<string>();
  for (const item of value.items) {
    if (!isRecord(item) || !isUuid(item.requirementId)) {
      return { error: "Produktlistan innehåller ett ogiltigt krav-id." };
    }
    const articleNumber = normalizeNrfNumber(text(item.articleNumber));
    if (articleNumber.length < 3 || articleNumber.length > 30) {
      return { error: "Produktlistan innehåller ett ogiltigt NRF-nummer." };
    }
    if (requirementIds.has(item.requirementId)) {
      return { error: "Varje produktpost får bara förekomma en gång." };
    }
    requirementIds.add(item.requirementId);
    items.push({ requirementId: item.requirementId, articleNumber });
  }

  return { data: items };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
