import { groupProductRequirementsByPdfChapter, type ProductChapterGroup } from "./product-post-groups";
import { comparePostNumbers, projectRequirementOrderPostNumber } from "./project-requirement-order";

type Requirement = Record<string, unknown> & { id: string };
export type ProductPostNode<T extends Requirement> = {
  key: string;
  requirement: T;
  children: ProductPostNode<T>[];
};
export type ProductPostNavigationGroup<T extends Requirement> = ProductChapterGroup<T> & {
  posts: ProductPostNode<T>[];
};

/** Numbered headings own their descendants, even across pages or extraction order. */
export function buildProductPostTree<T extends Requirement>(requirements: readonly T[]): ProductPostNode<T>[] {
  const nodes = requirements.map(requirement => ({ key: `post:${requirement.id}`, requirement, children: [] as ProductPostNode<T>[] }));
  const byNumber = new Map<string, ProductPostNode<T>[]>();
  for (const node of nodes) {
    const number = postNumber(node.requirement);
    if (!number) continue;
    const key = identity(node.requirement, number);
    byNumber.set(key, [...(byNumber.get(key) ?? []), node]);
  }
  const roots: ProductPostNode<T>[] = [];
  for (const node of nodes) {
    const parts = postNumber(node.requirement)?.split(".") ?? [];
    let parent: ProductPostNode<T> | undefined;
    while (parts.length > 1) {
      parts.pop();
      const candidates = byNumber.get(identity(node.requirement, parts.join(".")));
      // Repeated post numbers must never attach to an arbitrary heading.
      if (candidates?.length) {
        if (candidates.length === 1) parent = candidates[0];
        break;
      }
    }
    (parent?.children ?? roots).push(node);
  }
  function sortSiblings(siblings: ProductPostNode<T>[]) {
    siblings.sort((a, b) => {
      const left = postNumber(a.requirement), right = postNumber(b.requirement);
      const intro = (node: ProductPostNode<T>, number: string | null) => !number && record(node.requirement.value_json).chapterInformation === true;
      return Number(intro(b, right)) - Number(intro(a, left)) || comparePostNumbers(left, right);
    });
    siblings.forEach(node => sortSiblings(node.children));
  }
  sortSiblings(roots);
  return roots;
}

/** A filtered view still includes the headings that explain its visible children. */
export function productPostNavigationGroups<T extends Requirement>(requirements: readonly T[], allRequirements = requirements): ProductPostNavigationGroup<T>[] {
  const visible = new Set(requirements.map(row => row.id));
  function retain(nodes: ProductPostNode<T>[]): ProductPostNode<T>[] {
    return nodes.flatMap(node => {
      const children = retain(node.children);
      return visible.has(node.requirement.id) || children.length ? [{ ...node, children }] : [];
    });
  }
  return groupProductRequirementsByPdfChapter(allRequirements).flatMap(group => {
    const posts = retain(buildProductPostTree(group.requirements));
    return posts.length ? [{ ...group, posts, requirements: flattenProductPostTree(posts) }] : [];
  });
}

export function flattenProductPostTree<T extends Requirement>(nodes: readonly ProductPostNode<T>[]): T[] {
  return nodes.flatMap(node => [node.requirement, ...flattenProductPostTree(node.children)]);
}

/** Reveal the selected post when next/previous navigation crosses a closed branch. */
export function productPostExpansionKeys<T extends Requirement>(groups: readonly ProductPostNavigationGroup<T>[], id: string): string[] {
  function find(nodes: readonly ProductPostNode<T>[], path: string[]): string[] | undefined {
    for (const node of nodes) {
      if (node.requirement.id === id) return path;
      const found = find(node.children, [...path, node.key]);
      if (found) return found;
    }
  }
  for (const group of groups) {
    const path = find(group.posts, [group.key]);
    if (path) return path;
  }
  return [];
}

function postNumber(requirement: Requirement) {
  const value = projectRequirementOrderPostNumber(requirement)?.replace(/\s/g, "").replace(/\.$/, "");
  return value && /^\d+(?:\.\d+)*$/.test(value) ? value : null;
}

function identity(requirement: Requirement, number: string) {
  return JSON.stringify([requirement.source_technical_description_document_id ?? requirement.source_document_id ?? "", record(requirement.value_json).postScope ?? "", number]);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
