import { flattenProductPostTree, productChapterContents, type ProductPostNavigationGroup, type ProductPostNode } from "./product-post-tree";
import { projectRequirementOrderPostNumber } from "./project-requirement-order";

type Row = Record<string, unknown> & { id: string };
export type ProductPostSelectionGroup<T extends Row = Row> = { postNumber: string; description: string; requirements: T[] };

/** Use the existing document-scoped tree. A chapter is never a product group. */
export function productPostSelectionGroup<T extends Row>(groups: readonly ProductPostNavigationGroup<T>[], id: string): ProductPostSelectionGroup<T> | undefined {
  function find(nodes: ProductPostNode<T>[], parent?: ProductPostNode<T>): ProductPostSelectionGroup<T> | undefined {
    for (const node of nodes) {
      if (node.requirement?.id === id) {
        const group = node.children.length ? node : parent;
        if (!group) return undefined;
        const requirements = flattenProductPostTree([group]);
        if (!requirements.length) return undefined;
        return { postNumber: group.heading?.postNumber ?? projectRequirementOrderPostNumber(group.requirement!) ?? "",
          description: group.heading?.description ?? String(group.requirement!.value_text ?? group.requirement!.display_name ?? "Hovedpost"), requirements };
      }
      const match = find(node.children, node);
      if (match) return match;
    }
  }
  for (const group of groups) {
    const match = find(productChapterContents(group).posts);
    if (match) return match;
  }
}
