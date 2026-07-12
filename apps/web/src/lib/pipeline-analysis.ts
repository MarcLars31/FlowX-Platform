import type { DemoMaterialLine, ItemCategory, ProductResolutionRow } from "@/types";

export const supportedCategories: ItemCategory[] = [
  "Pipe",
  "Fitting",
  "Valve",
  "Sprinkler",
  "Equipment",
  "Support",
  "Fastener",
  "Accessory",
  "Other",
  "Unknown"
];

type PipelineItem = Partial<
  DemoMaterialLine &
    ProductResolutionRow & {
      product_id?: string;
      database_match_id?: string;
      matched_product?: string;
      matchedProduct?: string;
      databaseProduct?: string;
    }
>;

export function getCategory(item: PipelineItem): ItemCategory {
  const category = item.category ?? item.productCategory;

  if (!category) {
    return "Unknown";
  }

  const normalized = normalizeCategory(category);

  return supportedCategories.includes(normalized) ? normalized : "Unknown";
}

export function isMatched(item: PipelineItem) {
  return Boolean(
    item.product_id ||
      item.database_match_id ||
      item.matched_product ||
      item.matchedProduct ||
      item.databaseProduct
  );
}

export function groupByCategory<T extends PipelineItem>(items: T[]) {
  return items.reduce<Record<ItemCategory, T[]>>((groups, item) => {
    const category = getCategory(item);

    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(item);

    return groups;
  }, {} as Record<ItemCategory, T[]>);
}

export function getMissingProducts<T extends PipelineItem>(items: T[]) {
  return items.filter((item) => !isMatched(item));
}

export function getMatchedProducts<T extends PipelineItem>(items: T[]) {
  return items.filter((item) => isMatched(item));
}

export function getAverageConfidence(items: PipelineItem[]) {
  if (items.length === 0) {
    return 0;
  }

  const total = items.reduce((sum, item) => sum + (item.confidence ?? 0), 0);

  return Math.round(total / items.length);
}

export function getDetectedCategories(items: PipelineItem[]) {
  return Array.from(new Set(items.map((item) => getCategory(item))));
}

export type CategoryBreakdownRow = {
  category: ItemCategory;
  materialItems: number;
  matched: number;
  missing: number;
};

export function buildCategoryBreakdown({
  materialItems,
  matchedProducts
}: {
  materialItems: DemoMaterialLine[];
  matchedProducts: ProductResolutionRow[];
}): CategoryBreakdownRow[] {
  const materialGroups = groupByCategory(materialItems);
  const matchedGroups = groupByCategory(matchedProducts);
  const missingGroups = groupByCategory(getMissingProducts(materialItems));
  const categories = supportedCategories.filter(
    (category) =>
      (materialGroups[category]?.length ?? 0) > 0 ||
      (matchedGroups[category]?.length ?? 0) > 0 ||
      (missingGroups[category]?.length ?? 0) > 0
  );

  return categories.map((category) => ({
    category,
    materialItems: materialGroups[category]?.length ?? 0,
    matched: matchedGroups[category]?.length ?? 0,
    missing: missingGroups[category]?.length ?? 0
  }));
}

function normalizeCategory(category: string): ItemCategory {
  const normalized = category.trim().toLowerCase();

  if (normalized.startsWith("pipe")) return "Pipe";
  if (normalized.startsWith("fitting")) return "Fitting";
  if (normalized.startsWith("valve")) return "Valve";
  if (normalized.startsWith("sprinkler")) return "Sprinkler";
  if (normalized.startsWith("equipment") || normalized === "monitoring") {
    return "Equipment";
  }
  if (normalized.startsWith("support")) return "Support";
  if (normalized.startsWith("fastener")) return "Fastener";
  if (normalized.startsWith("accessory")) return "Accessory";
  if (normalized.startsWith("other")) return "Other";

  return "Unknown";
}
