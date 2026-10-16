import { classifyProductRequirement } from "./product-classification";
import { PRODUCT_REQUIREMENT_CATEGORIES, PRODUCT_REQUIREMENT_CATEGORY_VERSION, type ProductRequirementCategory } from "./product-category-taxonomy";
export { PRODUCT_REQUIREMENT_CATEGORIES, PRODUCT_REQUIREMENT_CATEGORY_VERSION, type ProductRequirementCategory } from "./product-category-taxonomy";
const categoryOrder = new Map<string, number>(PRODUCT_REQUIREMENT_CATEGORIES.map((category,index) => [category.id,index]));
export function productRequirementCategory(requirement: Record<string, unknown>): ProductRequirementCategory {
  const overview = requirement.overview as { category?: unknown; categoryVersion?: unknown } | undefined;
  if (overview?.categoryVersion === PRODUCT_REQUIREMENT_CATEGORY_VERSION && isProductRequirementCategory(overview.category)) return overview.category;
  const { category } = classifyProductRequirement(requirement);
  return category === "unknown" ? "other" : category;
}

export function sortProductRequirementsByCategory<Row extends Record<string, unknown>>(requirements: readonly Row[]) {
  return requirements.map((requirement, index) => ({ requirement, index }))
    .sort((left, right) => productCategoryOrder(productRequirementCategory(left.requirement))
      - productCategoryOrder(productRequirementCategory(right.requirement)) || left.index - right.index)
    .map(({ requirement }) => requirement);
}

export function productRequirementCategoryLabel(category: ProductRequirementCategory) {
  return PRODUCT_REQUIREMENT_CATEGORIES.find(item => item.id === category)?.label ?? "Övriga produkter";
}

function productCategoryOrder(category: ProductRequirementCategory) {
  return categoryOrder.get(category) ?? PRODUCT_REQUIREMENT_CATEGORIES.length;
}

function isProductRequirementCategory(value: unknown): value is ProductRequirementCategory {
  return typeof value === "string" && categoryOrder.has(value);
}
