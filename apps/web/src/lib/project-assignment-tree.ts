import { resolvePostParents } from "./project-post-hierarchy";
import { groupProductRequirementsByPdfChapter, productChapterHeading } from "./product-post-groups";
import { chapterAssignmentTarget, type AssignmentTarget } from "./project-work-assignment";
import type { ProjectDeliveryData, ProjectWorkPackage } from "./project-delivery-resource";

type Requirement = ProjectDeliveryData["requirements"][number];
export type AssignmentTreeNode = {
  key: string;
  number: string;
  title: string;
  page: number | null;
  documentId: string;
  children: AssignmentTreeNode[];
  requirementIds: string[];
  leafIds: string[];
  target?: AssignmentTarget;
};
export type AssignmentChange = { target: AssignmentTarget; existing?: ProjectWorkPackage };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** A row's identity is its UUID, never just its printed post number. */
export function buildAssignmentTree(requirements: readonly Requirement[]): AssignmentTreeNode[] {
  const graph = resolvePostParents(requirements);
  return groupProductRequirementsByPdfChapter(requirements).flatMap(group => {
    const heading = productChapterHeading(group.title);
    const documentId = group.requirements[0]?.source_technical_description_document_id ?? group.requirements[0]?.source_document_id ?? "";
    const root: AssignmentTreeNode = {
      key: `chapter:${group.key}`, number: heading.chapter === "—" ? "" : heading.chapter.replace(/\.$/, ""),
      title: heading.description, page: null, documentId, children: [], requirementIds: [], leafIds: [],
      target: chapterAssignmentTarget(group)
    };
    const nodes: AssignmentTreeNode[] = group.requirements.map(row => {
      const value = record(row.value_json);
      const page = Number(row.source_page ?? record(value.sourceChapter).sourcePage);
      if (page > 0) root.page = Math.min(root.page ?? Infinity, page);
      return {
        key: row.id, number: typeof value.postNumber === "string" ? value.postNumber.trim().replace(/\.$/, "") : "",
        title: row.value_text?.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 200) || "Post utan rubrik",
        page: page > 0 ? page : null, documentId, children: [], requirementIds: [row.id], leafIds: []
      };
    });
    const byNumber = new Map<string, AssignmentTreeNode[]>();
    for (const node of nodes) {
      if (node.number) byNumber.set(node.number, [...(byNumber.get(node.number) ?? []), node]);
    }
    for (const node of nodes) {
      if (node.number && node.number === root.number && byNumber.get(node.number)?.length === 1) {
        root.requirementIds.push(...node.requirementIds);
        continue;
      }
      const parentId = graph.parents.get(node.key);
      const candidate = nodes.find(node => node.key === parentId);
      const parent = candidate?.number === root.number ? root : candidate ?? root;
      parent.children.push(node);
    }
    function collect(node: AssignmentTreeNode) {
      for (const child of node.children) {
        collect(child);
        node.requirementIds.push(...child.requirementIds);
        node.leafIds.push(...child.leafIds);
      }
      if (!node.children.length) node.leafIds.push(node.key);
      if (node !== root) node.target = { type: node.children.length ? "main_post" : "post", value: node.key, label: `${node.number} ${node.title}`.trim() };
    }
    collect(root);
    return group.title === "Kapitel saknas i PDF" ? root.children : [root];
  });
}

export function selectedAssignmentNodes(tree: readonly AssignmentTreeNode[], selected: ReadonlySet<string>): AssignmentTreeNode[] {
  return tree.flatMap(node => node.leafIds.length > 0 && node.leafIds.every(id => selected.has(id)) ? [node] : selectedAssignmentNodes(node.children, selected));
}

export function assignmentSelectionPlan(tree: readonly AssignmentTreeNode[], selected: ReadonlySet<string>, packages: readonly ProjectWorkPackage[]): AssignmentChange[] {
  const changes = new Map<string, AssignmentChange>();
  function add(target: AssignmentTarget, existing?: ProjectWorkPackage) {
    changes.set(`${target.type}:${target.value}`, { target, existing });
  }
  for (const node of selectedAssignmentNodes(tree, selected)) {
    if (node.target) {
      const existing = packages.find(item => item.scope_type === node.target!.type && (item.scope_type === "pdf_chapter" ? node.requirementIds.includes(item.scope_value) : item.scope_value === node.target!.value));
      add(existing ? { ...node.target, value: existing.scope_value } : node.target, existing);
      // Exact post assignments remain exceptions when the chapter default changes.
    } else {
      for (const id of node.requirementIds) {
        add({ type: "post", value: id, label: `${node.number} ${node.title}`.trim() }, packages.find(item => item.scope_type === "post" && item.scope_value === id));
      }
    }
  }
  return [...changes.values()];
}

/** Each existing API mutation is revision checked. Stop scheduling more on failure. */
export async function saveAssignmentChanges(changes: readonly AssignmentChange[], save: (change: AssignmentChange) => Promise<void>, progress: (saved: number) => void = () => {}) {
  let next = 0;
  let saved = 0;
  const errors: string[] = [];
  await Promise.all(Array.from({ length: Math.min(4, changes.length) }, async () => {
    while (!errors.length && next < changes.length) {
      const change = changes[next++];
      try {
        await save(change);
        progress(++saved);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Tilldelningen kunde inte sparas.");
      }
    }
  }));
  return { saved, total: changes.length, error: errors[0] ?? "" };
}
