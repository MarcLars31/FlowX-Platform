import { groupProductRequirementsByPdfChapter } from "./product-post-groups";
import type { ProjectWorkPackage } from "./project-delivery-resource";

type Row = Record<string, unknown> & { id: string };
export type AssignmentTarget = { type: "post" | "pdf_chapter"; value: string; label: string };

/** The smallest row UUID is the stable anchor for one document's PDF chapter. */
export function chapterAssignmentTarget(group: { title: string; requirements: readonly Row[] }): AssignmentTarget {
  return { type: "pdf_chapter", value: group.requirements.map(row => row.id).sort()[0], label: group.title };
}

export function projectAssignmentIndex(requirements: readonly Row[], packages: readonly ProjectWorkPackage[]) {
  const chapterByRow = new Map<string, string>();
  for (const group of groupProductRequirementsByPdfChapter(requirements)) {
    for (const row of group.requirements) chapterByRow.set(row.id, group.key);
  }
  const priority = { post: 4, pdf_chapter: 3, chapter: 2, group: 1 };
  const ordered = [...packages].sort((a, b) => priority[b.scope_type] - priority[a.scope_type]
    || b.scope_value.length - a.scope_value.length || a.id.localeCompare(b.id));
  const result = new Map<string, ProjectWorkPackage>();
  for (const row of requirements) {
    const value = row.value_json;
    const post = typeof value === "string" ? value : String(value && typeof value === "object" ? (value as Record<string, unknown>).postNumber ?? "" : "");
    const assignment = ordered.find(item => item.scope_type === "post" ? item.scope_value === row.id
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
  if (item.scope_type === "post") {
    const row = requirements.find(row => row.id === item.scope_value);
    const value = row?.value_json;
    const number = typeof value === "string" ? value : value && typeof value === "object" ? (value as Record<string, unknown>).postNumber : null;
    return `Post ${number ?? "utan postnummer"}`;
  }
  return `${item.scope_type === "chapter" ? "Post" : "Grupp"} ${item.scope_value}`;
}
