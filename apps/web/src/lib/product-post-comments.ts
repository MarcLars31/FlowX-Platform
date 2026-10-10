import { isUuid } from "./distributor-product-mapping";
import { normalizeNrfNumber } from "./product-card-candidates";

export type ProductPostComment = {
  id: string;
  body: string;
  product_number: string | null;
  product_name: string | null;
  author_name: string;
  created_at: string;
  can_delete?: boolean;
};

export function validateProductPostComment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Kommentaren saknas." } as const;
  const input = value as Record<string, unknown>;
  if (!isUuid(input.id)) return { error: "Ogiltigt kommentar-id." } as const;
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 3000) {
    return { error: "Skriv en kommentar på högst 3 000 tecken." } as const;
  }
  const isPost = input.productNumber === null;
  if (!isPost && (typeof input.productNumber !== "string" || input.productNumber.length > 120 || !normalizeNrfNumber(input.productNumber))) {
    return { error: "Välj vilken produkt kommentaren gäller." } as const;
  }
  if (!isPost && (typeof input.productName !== "string" || input.productName.length > 240)) {
    return { error: "Produktnamnet är ogiltigt." } as const;
  }
  return { data: {
    id: input.id,
    body: input.body.trim(),
    product_number: isPost ? null : normalizeNrfNumber(input.productNumber as string),
    product_name: isPost ? null : (input.productName as string).trim() || null
  } } as const;
}
