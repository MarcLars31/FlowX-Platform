import { isUserApprovedProductAssignment } from "./approved-product-assignment";
import { splitDistributorRequirementLines } from "./distributor-requirement-lines";
import {
  productRequirementCategory,
  productRequirementCategoryLabel
} from "./product-requirement-category";
import { projectRequirementQuantity } from "./project-requirement-quantity";
import { productRequirementResolution } from "./product-requirement-resolution";

export type BusinessDevelopmentRequirementRow = Record<string, unknown> & {
  id: string;
  project_id: string;
  category: string;
  requirement_key: string;
  display_name?: string | null;
  value_text: string | null;
  value_json: unknown;
  mapping_fingerprint?: string | null;
  status: string;
};

export type BusinessDevelopmentAssignmentRow = Record<string, unknown> & {
  requirement_id: string | null;
  status: string;
  product_snapshot: unknown;
};

export type ProductGapOpportunity = {
  key: string;
  name: string;
  category: string;
  occurrences: number;
  projectCount: number;
  quantity: number | null;
  unit: string | null;
  priority: "high" | "medium" | "low";
  recommendedAction: string;
};

export type BusinessDevelopmentStatistics = {
  totalProductRequirements: number;
  approvedProductRequirements: number;
  notInAssortmentCount: number;
  productCoverageRate: number;
  handledProductRate: number;
  gapOpportunities: ProductGapOpportunity[];
};

export function buildBusinessDevelopmentStatistics({
  requirements,
  assignments
}: {
  requirements: readonly BusinessDevelopmentRequirementRow[];
  assignments: readonly BusinessDevelopmentAssignmentRow[];
}): BusinessDevelopmentStatistics {
  const productRequirements = splitDistributorRequirementLines([...requirements])
    .productRequirements;
  const productRequirementIds = new Set(productRequirements.map((row) => row.id));
  const approvedRequirementIds = new Set(
    assignments
      .filter(isUserApprovedProductAssignment)
      .map((assignment) => assignment.requirement_id)
      .filter((id): id is string => typeof id === "string" && productRequirementIds.has(id))
  );

  const gapGroups = new Map<string, ProductGapAccumulator>();
  let notInAssortmentCount = 0;

  for (const requirement of productRequirements) {
    if (!productRequirementResolution(requirement)) continue;
    notInAssortmentCount += 1;

    const name = requirementOpportunityName(requirement);
    const category = productRequirementCategory(requirement);
    const key = requirement.mapping_fingerprint?.trim()
      || `${category}:${normalize(name)}`;
    const quantity = projectRequirementQuantity(requirement.value_json);
    const current = gapGroups.get(key) ?? {
      key,
      name,
      category: productRequirementCategoryLabel(category),
      occurrences: 0,
      projectIds: new Set<string>(),
      quantities: new Map<string, number>()
    };

    current.occurrences += 1;
    current.projectIds.add(requirement.project_id);
    if (quantity.quantity !== null) {
      current.quantities.set(
        quantity.unit,
        (current.quantities.get(quantity.unit) ?? 0) + quantity.quantity
      );
    }
    gapGroups.set(key, current);
  }

  const gapOpportunities = [...gapGroups.values()]
    .map(toProductGapOpportunity)
    .sort((left, right) =>
      priorityOrder(left.priority) - priorityOrder(right.priority)
      || right.projectCount - left.projectCount
      || right.occurrences - left.occurrences
      || left.name.localeCompare(right.name, "sv")
    );
  const handledCount = new Set([
    ...approvedRequirementIds,
    ...productRequirements
      .filter((requirement) => productRequirementResolution(requirement))
      .map((requirement) => requirement.id)
  ]).size;

  return {
    totalProductRequirements: productRequirements.length,
    approvedProductRequirements: approvedRequirementIds.size,
    notInAssortmentCount,
    productCoverageRate: percent(approvedRequirementIds.size, productRequirements.length),
    handledProductRate: percent(handledCount, productRequirements.length),
    gapOpportunities
  };
}

type ProductGapAccumulator = {
  key: string;
  name: string;
  category: string;
  occurrences: number;
  projectIds: Set<string>;
  quantities: Map<string, number>;
};

function toProductGapOpportunity(group: ProductGapAccumulator): ProductGapOpportunity {
  const quantityEntries = [...group.quantities.entries()];
  const projectCount = group.projectIds.size;
  const priority = projectCount >= 3 || group.occurrences >= 5
    ? "high"
    : projectCount >= 2 || group.occurrences >= 2
      ? "medium"
      : "low";

  return {
    key: group.key,
    name: group.name,
    category: group.category,
    occurrences: group.occurrences,
    projectCount,
    quantity: quantityEntries.length === 1 ? quantityEntries[0][1] : null,
    unit: quantityEntries.length === 1 ? quantityEntries[0][0] : null,
    priority,
    recommendedAction: recommendedAction(group.category, priority)
  };
}

function requirementOpportunityName(requirement: BusinessDevelopmentRequirementRow) {
  const value = record(requirement.value_json);
  const raw = firstText(
    value.productName,
    value.title,
    value.description,
    requirement.display_name,
    requirement.value_text,
    requirement.requirement_key
  ) ?? "Produkt utan namn";
  const firstLine = raw.split(/\r?\n/)[0].replace(/\s+/g, " ").trim();
  return firstLine.length > 92 ? `${firstLine.slice(0, 89).trimEnd()}…` : firstLine;
}

function recommendedAction(category: string, priority: ProductGapOpportunity["priority"]) {
  if (category === "Sprinklerhuvuden och galler") {
    return priority === "high"
      ? "Utred lagerlagt alternativ och säkra rätt NRF-nummer"
      : "Bevaka liknande sprinklerkrav i kommande offerter";
  }
  if (category === "Ventiler") {
    return priority === "high"
      ? "Samla volym och begär rampris från inköp"
      : "Begär projektpris när behovet återkommer";
  }
  if (category === "Rör" || category === "Rördelar och kopplingar") {
    return "Jämför efterfrågan med befintliga dimensioner i sortimentet";
  }
  return priority === "high"
    ? "Prioritera sortimentsbedömning eller partnerlösning"
    : "Bevaka nästa liknande offert innan sortimentsbeslut";
}

function priorityOrder(priority: ProductGapOpportunity["priority"]) {
  return priority === "high" ? 0 : priority === "medium" ? 1 : 2;
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function normalize(value: string) {
  return value.toLocaleLowerCase("sv").replace(/\s+/g, " ").trim();
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
