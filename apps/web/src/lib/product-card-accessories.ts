import type { DistributorAccessoryInput } from "./distributor-product-mapping";
import type { AhlsellAccessorySuggestion } from "./ahlsell-public-match";
import { normalizeNrfNumber } from "./product-card-candidates";

export type ProductAccessoryDraft = Omit<DistributorAccessoryInput, "quantity"> & {
  quantity: string;
};

export function newProductAccessoryDraft(): ProductAccessoryDraft {
  return { name: "", productNumber: "", quantity: "1", unit: "st", notes: "" };
}

export function readProductAccessoryDrafts(value: unknown): ProductAccessoryDraft[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    const accessory = record(item);
    const name = text(accessory.name);
    if (!name) return [];

    return [{
      name,
      productNumber: text(accessory.productNumber),
      quantity: String(positiveNumber(accessory.quantity, 1)),
      unit: text(accessory.unit) || "st",
      notes: text(accessory.notes)
    }];
  });
}

export function accessoriesForSelectedProduct({
  currentProductNumber,
  nextProductNumber,
  accessories
}: {
  currentProductNumber: string;
  nextProductNumber: string;
  accessories: ProductAccessoryDraft[];
}) {
  const currentNrf = normalizeNrfNumber(currentProductNumber);
  const nextNrf = normalizeNrfNumber(nextProductNumber);
  return currentNrf && currentNrf === nextNrf ? accessories : [];
}

export function productAccessoryDraftError(accessories: ProductAccessoryDraft[]) {
  if (accessories.length > 20) return "Högst 20 tillbehör kan sparas på en produkt.";

  const identities = new Set<string>();
  for (let index = 0; index < accessories.length; index += 1) {
    const accessory = accessories[index];
    const name = accessory.name.trim();
    if (!name) return `Fyll i namnet på tillbehör ${index + 1} eller ta bort raden.`;
    const quantity = Number(accessory.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) {
      return `Ange en giltig mängd för tillbehöret ${name}.`;
    }

    const nrf = normalizeNrfNumber(accessory.productNumber);
    const identity = nrf ? `nrf:${nrf}` : `name:${normalizeIdentity(name)}`;
    if (identities.has(identity)) return `${name} är redan tillagt som tillbehör.`;
    identities.add(identity);
  }

  return null;
}

export function productAccessoryPayload(accessories: ProductAccessoryDraft[]): DistributorAccessoryInput[] {
  return accessories.map((accessory) => ({
    name: accessory.name.trim(),
    productNumber: accessory.productNumber.trim(),
    quantity: Number(accessory.quantity),
    unit: accessory.unit.trim() || "st",
    notes: accessory.notes.trim()
  }));
}

export function hasSuggestedProductAccessory(
  accessories: readonly ProductAccessoryDraft[],
  suggestion: AhlsellAccessorySuggestion
) {
  const suggestedNrf = normalizeNrfNumber(suggestion.articleNumber);
  return accessories.some((accessory) => suggestedNrf
    ? normalizeNrfNumber(accessory.productNumber) === suggestedNrf
    : normalizeIdentity(accessory.name) === normalizeIdentity(suggestion.productName));
}

export function toggleSuggestedProductAccessory(
  accessories: readonly ProductAccessoryDraft[],
  suggestion: AhlsellAccessorySuggestion,
  selected: boolean
): ProductAccessoryDraft[] {
  const alreadySelected = hasSuggestedProductAccessory(accessories, suggestion);
  if (!selected) {
    const suggestedNrf = normalizeNrfNumber(suggestion.articleNumber);
    return accessories.filter((accessory) => suggestedNrf
      ? normalizeNrfNumber(accessory.productNumber) !== suggestedNrf
      : normalizeIdentity(accessory.name) !== normalizeIdentity(suggestion.productName));
  }
  if (alreadySelected || accessories.length >= 20) return [...accessories];
  return [...accessories, {
    name: suggestion.productName,
    productNumber: suggestion.articleNumber,
    quantity: String(suggestion.quantity),
    unit: suggestion.unit || "st",
    notes: `ScipX-förslag: ${suggestion.reason}`
  }];
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeIdentity(value: string) {
  return value.trim().toLocaleLowerCase("sv-SE").replace(/\s+/g, " ");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
