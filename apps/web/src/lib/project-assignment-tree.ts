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
  return groupProductRequirementsByPdfChapter(requirements).map(group => {
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
      let parent = root;
      let number = node.number;
      while (number.includes(".")) {
        number = number.slice(0, number.lastIndexOf("."));
        if (number === root.number) break;
        const candidates = byNumber.get(number);
        // An ambiguous repeated number must not swallow another row's children.
        if (candidates?.length === 1) { parent = candidates[0]; break; }
      }
      parent.children.push(node);
    }
    function collect(node: AssignmentTreeNode) {
      for (const child of node.children) {
        collect(child);
        node.requirementIds.push(...child.requirementIds);
        node.leafIds.push(...child.leafIds);
      }
      if (!node.children.length) node.leafIds.push(node.key);
    }
    collect(root);
    return root;
  });
}

export function selectedAssignmentNodes(tree: readonly AssignmentTreeNode[], selected: ReadonlySet<string>): AssignmentTreeNode[] {
  return tree.flatMap(node => node.leafIds.every(id => selected.has(id)) ? [node] : selectedAssignmentNodes(node.children, selected));
}

export function assignmentSelectionPlan(tree: readonly AssignmentTreeNode[], selected: ReadonlySet<string>, packages: readonly ProjectWorkPackage[]): AssignmentChange[] {
  const changes = new Map<string, AssignmentChange>();
  function add(target: AssignmentTarget, existing?: ProjectWorkPackage) {
    changes.set(`${target.type}:${target.value}`, { target, existing });
  }
  for (const node of selectedAssignmentNodes(tree, selected)) {
    if (node.target) {
      const existing = packages.find(item => item.scope_type === "pdf_chapter" && node.requirementIds.includes(item.scope_value));
      add(existing ? { ...node.target, value: existing.scope_value } : node.target, existing);
      // Selecting the whole chapter also updates its existing, higher-priority post overrides.
      for (const item of packages.filter(item => item.scope_type === "post" && node.requirementIds.includes(item.scope_value))) {
        add({ type: "post", value: item.scope_value, label: node.target.label }, item);
      }
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
