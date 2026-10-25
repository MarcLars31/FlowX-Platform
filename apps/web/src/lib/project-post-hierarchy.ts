import { sortProjectRequirementsBySource, projectRequirementOrderPostNumber } from "./project-requirement-order";
import { visibleProjectRequirements } from "./project-requirement-views";
import { chapterCaptionPath, joinedChapterNumber } from "./pdf-chapter-navigation";

export type HierarchyRow = Record<string, unknown> & { id: string };
export type MainPostGroup = { id: string; sourceId: string | null; number: string; title: string; requirementIds: string[]; review?: boolean; standalone?: boolean };
export const hierarchyValue = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const postDocumentId = (row: HierarchyRow) => String(row.source_technical_description_document_id ?? row.source_document_id ?? "");
export const postScopeKey = (row: HierarchyRow) => JSON.stringify([postDocumentId(row), hierarchyValue(row.value_json).postScope ?? ""]);
export function isSourceChapter(row: HierarchyRow) {
  const value = hierarchyValue(row.value_json), number = projectRequirementOrderPostNumber(row);
  if (value.chapterInformation === true) return true;
  const path = chapterCaptionPath(String(hierarchyValue(value.sourceChapter).title ?? ""));
  return Boolean(number && path.some((_, index) => joinedChapterNumber(path.slice(0, index + 1)) === number));
}
export function uncertainPost(row: HierarchyRow) {
  const flags = hierarchyValue(row.value_json).reviewFlags;
  return Array.isArray(flags) && flags.some(flag => ["unassigned-source-text", "unverified-post-source"].includes(String(flag))) && !isSourceChapter(row);
}

/** Explicit source relations only. Printed numbers are addresses within one
 * document and place/table scope, never globally unique identifiers. */
export function resolvePostParents(requirements: readonly HierarchyRow[]) {
  const rows = sortProjectRequirementsBySource(requirements.filter(row => !["rejected", "superseded"].includes(String(row.status))));
  const byId = new Map(rows.map(row => [row.id, row]));
  const addresses = new Map<string, HierarchyRow[]>(), sourceIds = new Map<string, HierarchyRow[]>();
  for (const row of rows) {
    const value = hierarchyValue(row.value_json);
    for (const [map, address] of [[addresses, projectRequirementOrderPostNumber(row)], [sourceIds, value.sourcePostId]] as const) {
      if (typeof address !== "string" || !address) continue;
      const key = JSON.stringify([postScopeKey(row), address]);
      map.set(key, [...(map.get(key) ?? []), row]);
    }
  }
  const parents = new Map<string, string>(), unresolved = new Set<string>();
  for (const row of rows) {
    const value = hierarchyValue(row.value_json);
    const explicitId = typeof value.parentRequirementId === "string" && value.parentRequirementId;
    const sourceId = typeof value.parentSourcePostId === "string" && value.parentSourcePostId;
    const number = typeof value.parentPostNumber === "string" && value.parentPostNumber;
    if (!explicitId && !sourceId && !number) continue;
    const candidates = explicitId ? [byId.get(explicitId)].filter((r): r is HierarchyRow => Boolean(r))
      : (sourceId ? sourceIds.get(JSON.stringify([postScopeKey(row), sourceId])) : addresses.get(JSON.stringify([postScopeKey(row), number]))) ?? [];
    const parent = candidates.length === 1 ? candidates[0] : undefined;
    const preceding = parent && (Number(parent.source_page ?? 0) < Number(row.source_page ?? 0)
      || Number(parent.source_page ?? 0) === Number(row.source_page ?? 0) && Number(hierarchyValue(parent.value_json).sourceOrder ?? 0) < Number(value.sourceOrder ?? 0));
    if (!parent || (!explicitId && !sourceId && !preceding) || postScopeKey(parent) !== postScopeKey(row) || uncertainPost(parent)) { unresolved.add(row.id); continue; }
    parents.set(row.id, parent.id);
  }
  const ancestors = new Map<string, string[]>();
  for (const row of rows) {
    const path: string[] = []; let id = parents.get(row.id);
    const seen = new Set([row.id]);
    while (id) {
      if (seen.has(id)) { for (const member of seen) { unresolved.add(member); parents.delete(member); } path.length = 0; break; }
      seen.add(id); path.unshift(id); id = parents.get(id);
    }
    ancestors.set(row.id, path);
    if (path.some(id => unresolved.has(id))) unresolved.add(row.id);
  }
  return { rows, byId, parents, ancestors, unresolved };
}

export function groupProductsByMainPost(requirements: readonly HierarchyRow[], productIds?: ReadonlySet<string>): MainPostGroup[] {
  const graph = resolvePostParents(requirements);
  const products = productIds ?? new Set(visibleProjectRequirements(graph.rows).map(row => row.id));
  const groups = new Map<string, MainPostGroup>();
  for (const row of graph.rows) {
    if (!products.has(row.id)) continue;
    const review = graph.unresolved.has(row.id) || uncertainPost(row);
    const parent = review ? undefined : [...(graph.ancestors.get(row.id) ?? [])].reverse().map(id => graph.byId.get(id)!).find(source => !isSourceChapter(source));
    const main = parent ?? row;
    const id = review ? `review:${row.id}` : main.id;
    const group = groups.get(id) ?? { id, sourceId: review ? null : main.id, number: projectRequirementOrderPostNumber(main) ?? "",
      title: String(main.value_text ?? main.display_name ?? "Post utan rubrik"), requirementIds: [], ...(review ? { review: true } : !parent ? { standalone: true } : {}) };
    if (parent) group.standalone = false;
    group.requirementIds.push(row.id); groups.set(id, group);
  }
  return [...groups.values()];
}
