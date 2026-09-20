import { projectRequirementDetails } from "./project-requirement-details";
import { comparePostNumbers } from "./project-requirement-order";

type Requirement = Record<string, unknown> & { id: string };

export type ProductPostGroup<T extends Requirement> = {
  key: string;
  postNumber: string | null;
  requirements: T[];
};

export function groupProductRequirementsByMainPost<T extends Requirement>(
  requirements: readonly T[],
  { allRequirements = requirements, preserveRowOrder = false }: {
    allRequirements?: readonly T[];
    preserveRowOrder?: boolean;
  } = {}
): ProductPostGroup<T>[] {
  // Use the full list for context so a product-category filter does not move
  // a parent product into another group when its child rows are filtered out.
  const parentNumbers = new Set(allRequirements.flatMap(requirement => {
    const details = projectRequirementDetails(requirement);
    const parent = details.parentPostNumber ?? inferredParent(details.postNumber);
    return parent ? [parent] : [];
  }));
  const groups = new Map<string, ProductPostGroup<T>>();
  for (const requirement of requirements) {
    const details = projectRequirementDetails(requirement);
    // A priced parent and its child products belong in the same dropdown.
    const postNumber = details.postNumber && parentNumbers.has(details.postNumber)
      ? details.postNumber
      : details.parentPostNumber ?? inferredParent(details.postNumber) ?? details.postNumber;
    const key = postNumber ? `post:${postNumber}` : "missing-post";
    const group = groups.get(key) ?? { key, postNumber, requirements: [] };
    group.requirements.push(requirement);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((left, right) => comparePostNumbers(left.postNumber, right.postNumber))
    .map(group => ({ ...group, requirements: preserveRowOrder ? group.requirements : [...group.requirements].sort(
      (left, right) => comparePostNumbers(projectRequirementDetails(left).postNumber, projectRequirementDetails(right).postNumber)
    ) }));
}

function inferredParent(postNumber: string | null) {
  const separator = postNumber?.lastIndexOf(".") ?? -1;
  return postNumber && separator > 0 ? postNumber.slice(0, separator) : null;
}
