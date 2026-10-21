import { visibleProjectRequirements } from "./project-requirement-views";
import { projectRequirementOrderPostNumber, sortProjectRequirementsBySource } from "./project-requirement-order";
import { currentPostRequirement } from "./current-post-requirement";
import { requirementSnapshot } from "./requirement-snapshot";

type Row = Record<string, unknown> & { id: string };
export type ChapterSource = { id: string; number: string; title: string; text: string; pages: number[]; parentId?: string };
export type ChapterSection = { id: string; sourceId: string | null; title: string; number: string; requirementIds: string[]; warning?: string };
export type WorkspaceChapter = { id: string; sourceId: string | null; title: string; number: string; sections: ChapterSection[] };
export type ChapterWorkspace = { chapters: WorkspaceChapter[]; sources: Record<string, ChapterSource>; ancestors: Record<string, string[]> };

/** Saved requirement IDs are the identity. Legacy parent numbers are resolved
 * only through an explicit parent reference in the same document and scope,
 * with source-order evidence. Ambiguous links never choose an arbitrary parent. */
export function buildChapterWorkspace(requirements: Row[]): ChapterWorkspace {
  const rows = sortProjectRequirementsBySource(requirements.filter(row => !["rejected", "superseded"].includes(String(row.status))).map(requirementSnapshot));
  const purchasable = new Set(visibleProjectRequirements(rows).map(row => row.id));
  const byId = new Map(rows.map(row => [row.id, row]));
  const positions = new Map(rows.map((row, index) => [row.id, index]));
  const sources: ChapterWorkspace["sources"] = {}, ancestors: ChapterWorkspace["ancestors"] = {};
  const scope = (row: Row) => JSON.stringify([row.source_document_id ?? row.source_technical_description_document_id ?? "", record(row.value_json).postScope ?? ""]);
  const byAddress = new Map<string, Row[]>();
  for (const row of rows) {
    const address = JSON.stringify([scope(row), projectRequirementOrderPostNumber(row)]);
    byAddress.set(address, [...(byAddress.get(address) ?? []), row]);
  }
  const parentById = new Map<string, string>(), children = new Map<string, Row[]>(), unlinked = new Set<string>();
  for (const row of rows) {
    const value = record(row.value_json), parentNumber = value.parentPostNumber;
    const explicit = typeof value.parentRequirementId === "string" ? byId.get(value.parentRequirementId) : undefined;
    const candidates = explicit ? [explicit] : typeof parentNumber === "string" && parentNumber
      ? byAddress.get(JSON.stringify([scope(row), parentNumber])) ?? [] : [];
    if (!explicit && !parentNumber) continue;
    const parent = candidates.length === 1 ? candidates[0] : undefined;
    if (!parent || scope(parent) !== scope(row) || positions.get(parent.id)! >= positions.get(row.id)!) { unlinked.add(row.id); continue; }
    parentById.set(row.id, parent.id);
    children.set(parent.id, [...(children.get(parent.id) ?? []), row]);
  }
  for (const row of rows) {
    const own = currentPostRequirement(row), value = record(own.value_json);
    const pages = [...new Set([Number(row.source_page), ...(Array.isArray(value.sourcePages) ? value.sourcePages.map(Number) : [])])].filter(page => Number.isSafeInteger(page) && page > 0);
    sources[row.id] = { id: row.id, number: projectRequirementOrderPostNumber(row) ?? "", title: String(row.value_text ?? row.display_name ?? "Rubrik saknas"),
      text: String((record(value.headingSplit).status === "separated" ? record(value.headingSplit).requirementText : null) ?? value.pdfDescriptionText ?? value.sourceText ?? value.technicalSpecification ?? own.source_excerpt ?? ""), pages, parentId: parentById.get(row.id) };
    const path: string[] = [];
    let parent = parentById.get(row.id);
    while (parent) { path.unshift(parent); parent = parentById.get(parent); }
    ancestors[row.id] = path;
  }
  const assigned = new Set<string>();
  function collect(row: Row): string[] {
    const own = purchasable.has(row.id) ? [row.id] : [];
    own.forEach(id => assigned.add(id));
    return [...own, ...(children.get(row.id) ?? []).flatMap(collect)];
  }
  let roots = rows.filter(row => !parentById.has(row.id) && !unlinked.has(row.id) && !purchasable.has(row.id));
  // A project/object wrapper with one child is not an extra chapter-navigation
  // step. Retain it in the ancestor path and its original requirements.
  roots = roots.flatMap(root => {
    const nested = children.get(root.id) ?? [];
    return /^\d{4,6}$/.test(sources[root.id].number) && nested.length === 1 && !purchasable.has(nested[0].id)
      ? nested : [root];
  });
  const chapters: WorkspaceChapter[] = roots.map(root => {
    const sections: ChapterSection[] = [], direct: string[] = [];
    for (const child of children.get(root.id) ?? []) {
      if (!purchasable.has(child.id) || children.has(child.id)) {
        const source = sources[child.id];
        sections.push({ id: child.id, sourceId: child.id, number: source.number, title: source.title, requirementIds: collect(child) });
      } else direct.push(...collect(child));
    }
    if (direct.length || !sections.length) sections.unshift({ id: root.id + ":direct", sourceId: null, number: sources[root.id].number,
      title: "Poster direkt under kapitlet", requirementIds: direct });
    return { id: root.id, sourceId: root.id, number: sources[root.id].number, title: sources[root.id].title, sections };
  });
  const missing = rows.filter(row => purchasable.has(row.id) && !assigned.has(row.id));
  if (missing.length) chapters.push({ id: "unlinked", sourceId: null, number: "", title: "Poster utan säker kapitelkoppling",
    sections: [{ id: "unlinked:posts", sourceId: null, number: "", title: "Kontrollera kapitelkopplingen", requirementIds: missing.map(row => row.id),
      warning: "Dessa poster saknar en entydig koppling till PDF-kapitlen. Ingen kapiteltext har lagts till automatiskt." }] });
  for (const row of missing) ancestors[row.id] = [];
  const used = new Set([...chapters.flatMap(chapter => [chapter.sourceId, ...chapter.sections.map(section => section.sourceId)]),
    ...Object.entries(ancestors).filter(([id]) => assigned.has(id)).flatMap(([, ids]) => ids)].filter((id): id is string => Boolean(id)));
  return { chapters, sources: Object.fromEntries(Object.entries(sources).filter(([id]) => used.has(id))),
    ancestors: Object.fromEntries(Object.entries(ancestors).filter(([id]) => purchasable.has(id))) };
}
export function initialSectionPost(section: ChapterSection, selected: ReadonlySet<string>, remembered?: string) {
  return remembered && section.requirementIds.includes(remembered) ? remembered
    : section.requirementIds.find(id => !selected.has(id)) ?? section.requirementIds[0] ?? null;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
