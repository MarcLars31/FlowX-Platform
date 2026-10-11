import { groupProductRequirementsByPdfChapter, productChapterHeading, type ProductChapterGroup } from "./product-post-groups";
import { comparePostNumbers, projectRequirementOrderPostNumber } from "./project-requirement-order";

type Requirement = Record<string, unknown> & { id: string };
export type ProductPostNode<T extends Requirement> = {
  key: string;
  children: ProductPostNode<T>[];
} & ({ requirement: T; heading?: never } | {
  requirement: null;
  heading: { postNumber: string; description: string };
});
export type ProductPostNavigationGroup<T extends Requirement> = ProductChapterGroup<T> & {
  posts: ProductPostNode<T>[];
};

/** PDF headings can be preserved on children without being purchasable posts. */
export function buildProductPostTree<T extends Requirement>(requirements: readonly T[], chapterNumber?: string): ProductPostNode<T>[] {
  const nodes: ProductPostNode<T>[] = requirements.map(requirement => ({ key: `post:${requirement.id}`, requirement, children: [] }));
  const byNumber = new Map<string, ProductPostNode<T>[]>();
  const sources = new Map(nodes.map(node => [node, node.requirement!]));
  const numberOf = (node: ProductPostNode<T>) => node.heading?.postNumber ?? postNumber(node.requirement!);
  for (const node of nodes) {
    const number = numberOf(node);
    if (!number) continue;
    const key = identity(sources.get(node)!, number);
    byNumber.set(key, [...(byNumber.get(key) ?? []), node]);
  }
  const headings = new Map<string, { number: string; source: T; names: Set<string> }>();
  for (const requirement of requirements) {
    const value = record(requirement.value_json);
    const parent = normalizedNumber(value.parentPostNumber);
    const number = postNumber(requirement);
    // Only explicit ancestor metadata supplies a missing heading. Do not infer
    // titles from product text or merge separate documents/numbering scopes.
    if (!parent || parent === chapterNumber || !number?.startsWith(`${parent}.`)) continue;
    const key = identity(requirement, parent);
    if (byNumber.has(key)) continue;
    const heading = headings.get(key) ?? { number: parent, source: requirement, names: new Set<string>() };
    if (typeof value.parentDescription === "string" && value.parentDescription.trim()) heading.names.add(value.parentDescription.replace(/\s+/g, " ").trim());
    headings.set(key, heading);
  }
  for (const [key, heading] of headings) {
    const node: ProductPostNode<T> = {
      key: `heading:${key}`, requirement: null, children: [],
      heading: { postNumber: heading.number, description: heading.names.size === 1 ? [...heading.names][0] : "Hovedpost" }
    };
    nodes.push(node);
    sources.set(node, heading.source);
    byNumber.set(key, [node]);
  }
  const roots: ProductPostNode<T>[] = [];
  for (const node of nodes) {
    const parts = numberOf(node)?.split(".") ?? [];
    let parent: ProductPostNode<T> | undefined;
    while (parts.length > 1) {
      parts.pop();
      const candidates = byNumber.get(identity(sources.get(node)!, parts.join(".")));
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
      const left = numberOf(a), right = numberOf(b);
      const intro = (node: ProductPostNode<T>, number: string | null) => !number && node.requirement && record(node.requirement.value_json).chapterInformation === true;
      return Number(Boolean(intro(b, right))) - Number(Boolean(intro(a, left))) || comparePostNumbers(left, right);
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
      return (node.requirement && visible.has(node.requirement.id)) || children.length ? [{ ...node, children }] : [];
    });
  }
  return groupProductRequirementsByPdfChapter(allRequirements).flatMap(group => {
    const posts = retain(buildProductPostTree(group.requirements, productChapterHeading(group.title).chapter));
    return posts.length ? [{ ...group, posts, requirements: flattenProductPostTree(posts) }] : [];
  });
}

/** Navigation-only headings never enter product counts, saving or next/previous. */
export function flattenProductPostTree<T extends Requirement>(nodes: readonly ProductPostNode<T>[]): T[] {
  return nodes.flatMap(node => [...(node.requirement ? [node.requirement] : []), ...flattenProductPostTree(node.children)]);
}

/** Reveal the selected post when next/previous navigation crosses a closed branch. */
export function productPostExpansionKeys<T extends Requirement>(groups: readonly ProductPostNavigationGroup<T>[], id: string): string[] {
  function find(nodes: readonly ProductPostNode<T>[], path: string[]): string[] | undefined {
    for (const node of nodes) {
      if (node.requirement?.id === id) return path;
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
  return normalizedNumber(projectRequirementOrderPostNumber(requirement));
}

function normalizedNumber(value: unknown) {
  const number = typeof value === "string" ? value.replace(/\s/g, "").replace(/\.$/, "") : "";
  return /^\d+(?:\.\d+)*$/.test(number) ? number : null;
}

function identity(requirement: Requirement, number: string) {
  return JSON.stringify([requirement.source_technical_description_document_id ?? requirement.source_document_id ?? "", record(requirement.value_json).postScope ?? "", number]);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
