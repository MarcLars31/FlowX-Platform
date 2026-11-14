import { resolvePostParents } from "./project-post-hierarchy";
import { groupProductRequirementsByPdfChapter } from "./product-post-groups";
import type { ProjectWorkPackage } from "./project-delivery-resource";

type Row = Record<string, unknown> & { id: string };
export type AssignmentTarget = { type: "post" | "main_post" | "pdf_chapter"; value: string; label: string };

/** The smallest row UUID is the stable anchor for one document's PDF chapter. */
export function chapterAssignmentTarget(group: { title: string; requirements: readonly Row[] }): AssignmentTarget {
  return { type: "pdf_chapter", value: group.requirements.map(row => row.id).sort()[0], label: group.title };
}

export function projectAssignmentIndex(requirements: readonly Row[], packages: readonly ProjectWorkPackage[]) {
  const chapterByRow = new Map<string, string>();
  for (const group of groupProductRequirementsByPdfChapter(requirements)) {
    for (const row of group.requirements) chapterByRow.set(row.id, group.key);
  }
  const graph = resolvePostParents(requirements);
  const priority = { main_post: 4, post: 5, pdf_chapter: 3, chapter: 2, group: 1 };
  const ordered = packages.filter(item => item.assignment_mode !== "inherit").sort((a, b) => priority[b.scope_type] - priority[a.scope_type]
    || b.scope_value.length - a.scope_value.length || a.id.localeCompare(b.id));
  const result = new Map<string, ProjectWorkPackage>();
  for (const row of requirements) {
    const value = row.value_json;
    const post = typeof value === "string" ? value : String(value && typeof value === "object" ? (value as Record<string, unknown>).postNumber ?? "" : "");
    const ancestors = [...(graph.ancestors.get(row.id) ?? [])].reverse();
    const applicable = [...ordered].sort((a,b) => a.scope_type === "main_post" && b.scope_type === "main_post"
      ? (a.scope_value === row.id ? -1 : ancestors.indexOf(a.scope_value)) - (b.scope_value === row.id ? -1 : ancestors.indexOf(b.scope_value)) : 0);
    const assignment = applicable.find(item => item.scope_type === "post" ? item.scope_value === row.id
      : item.scope_type === "main_post" ? item.scope_value === row.id || ancestors.includes(item.scope_value)
      : item.scope_type === "pdf_chapter" ? chapterByRow.has(item.scope_value) && chapterByRow.get(item.scope_value) === chapterByRow.get(row.id)
      : item.scope_type === "chapter" ? post === item.scope_value || post.startsWith(`${item.scope_value}.`)
      : item.scope_value === row.category);
    if (assignment) result.set(row.id, assignment);
  }
  return result;
}

export function workPackageLabel(item: ProjectWorkPackage, requirements: readonly Row[]) {
  if (item.scope_type === "pdf_chapter") return groupProductRequirementsByPdfChapter(requirements)
    .find(group => group.requirements.some(row => row.id === item.scope_value))?.title ?? "Tidigare kapitel";
  if (item.scope_type === "post" || item.scope_type === "main_post") {
    const row = requirements.find(row => row.id === item.scope_value);
    const value = row?.value_json;
    const number = typeof value === "string" ? value : value && typeof value === "object" ? (value as Record<string, unknown>).postNumber : null;
    const title = typeof row?.value_text === "string" ? row.value_text.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.slice(0, 120) : "";
    return `${item.scope_type === "main_post" ? "Huvudpost" : "Post"} ${number ?? "utan postnummer"}${title ? ` · ${title}` : ""}`;
  }
  return `${item.scope_type === "chapter" ? "Post" : "Grupp"} ${item.scope_value}`;
}
