export type ProductRequirementCategory =
  | "sprinkler_head"
  | "pipe"
  | "fitting"
  | "valve"
  | "control"
  | "support"
  | "other";

export const PRODUCT_REQUIREMENT_CATEGORIES: ReadonlyArray<{
  id: ProductRequirementCategory;
  label: string;
  shortLabel: string;
}> = [
  { id: "sprinkler_head", label: "Sprinklerhuvuden och galler", shortLabel: "Sprinklerhuvuden" },
  { id: "pipe", label: "Rör", shortLabel: "Rör" },
  { id: "fitting", label: "Rördelar och kopplingar", shortLabel: "Rördelar" },
  { id: "valve", label: "Ventiler", shortLabel: "Ventiler" },
  { id: "control", label: "Styrning och mätning", shortLabel: "Styrning" },
  { id: "support", label: "Upphängning och montage", shortLabel: "Upphängning" },
  { id: "other", label: "Övriga produkter", shortLabel: "Övrigt" }
];

const categoryOrder = new Map(
  PRODUCT_REQUIREMENT_CATEGORIES.map((category, index) => [category.id, index])
);

export function productRequirementCategory(
  requirement: Record<string, unknown>
): ProductRequirementCategory {
  const category = String(requirement.category ?? "").toLowerCase();
  if (isProductRequirementCategory(category)) return category;

  const searchable = normalize(flattenText({
    requirementKey: requirement.requirement_key,
    displayName: requirement.display_name,
    valueText: requirement.value_text,
    sourceExcerpt: requirement.source_excerpt,
    value: requirement.value_json
  }));

  if (/\b(?:sprinklerhode|sprinkler head|sprinklergitter|beskyttelsesgitter|skyddskorg)\b/.test(searchable)) {
    return "sprinkler_head";
  }
  if (/\b(?:kupling|rillekobling|bend|rorboy|t ror|tee|reduksjon|overgang|flensadapter|endelokk|anboringsklammer|ror(?:del|deler))\b/.test(searchable)) {
    return "fitting";
  }
  if (/\b(?:ventil|sprinklersentral|alarmventil|tilbakeslagsventil|kuleventil|spjeldventil)\b/.test(searchable)) {
    return "valve";
  }
  if (/\b(?:rorledning|sprinklerror|stalror|ror i lengder|sorte ror)\b/.test(searchable)
    || /\bunit m\b/.test(searchable)) {
    return "pipe";
  }
  if (/\b(?:pressostat|trykkvakt|stromningsvakt|flow switch|manometer|overvakning|alarm)\b/.test(searchable)) {
    return "control";
  }
  if (/\b(?:roroppheng|rorklammer|oppheng|klammer|dekkskive|montasjemateriell)\b/.test(searchable)) {
    return "support";
  }
  return "other";
}

export function sortProductRequirementsByCategory<Row extends Record<string, unknown>>(
  requirements: readonly Row[]
) {
  return requirements
    .map((requirement, index) => ({ requirement, index }))
    .sort((left, right) =>
      productCategoryOrder(productRequirementCategory(left.requirement))
      - productCategoryOrder(productRequirementCategory(right.requirement))
      || left.index - right.index
    )
    .map(({ requirement }) => requirement);
}

export function productRequirementCategoryLabel(category: ProductRequirementCategory) {
  return PRODUCT_REQUIREMENT_CATEGORIES.find((item) => item.id === category)?.label ?? "Övriga produkter";
}

function productCategoryOrder(category: ProductRequirementCategory) {
  return categoryOrder.get(category) ?? PRODUCT_REQUIREMENT_CATEGORIES.length;
}

function isProductRequirementCategory(value: string): value is ProductRequirementCategory {
  return value === "sprinkler_head"
    || value === "pipe"
    || value === "fitting"
    || value === "valve"
    || value === "control"
    || value === "support";
}

function flattenText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(flattenText).join(" ");
  }
  return "";
}

function normalize(value: string) {
  return value.toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
