import { visibleProjectRequirements } from "./project-requirement-views";
import { projectRequirementOrderPostNumber, sortProjectRequirementsBySource } from "./project-requirement-order";
import { currentPostRequirement } from "./current-post-requirement";
import { requirementSnapshot } from "./requirement-snapshot";
import { ownRequirementBody } from "./own-requirement-text";

import { resolvePostParents, type MainPostGroup } from "./project-post-hierarchy";

type Row = Record<string, unknown> & { id: string };
export type ChapterSource = { id: string; number: string; title: string; text: string; pages: number[]; parentId?: string };
export type ChapterSection = { id: string; sourceId: string | null; title: string; number: string; requirementIds: string[]; textSourceIds?: string[]; warning?: string };
export type WorkspaceChapter = { id: string; sourceId: string | null; title: string; number: string; sections: ChapterSection[]; mainPosts?: MainPostGroup[]; kind?: "review" | "main-post" };
export type ChapterWorkspace = { chapters: WorkspaceChapter[]; sources: Record<string, ChapterSource>; ancestors: Record<string, string[]> };

/** Navigation presents a chapter as one list. Keep the source hierarchy intact
 * for requirement inheritance and collect all text when removing the extra step. */
export function chapterPostSection(chapter: WorkspaceChapter): ChapterSection {
  return {
    id: chapter.id, sourceId: chapter.sourceId, number: chapter.number, title: chapter.title,
    requirementIds: [...new Set(chapter.sections.flatMap(section => section.requirementIds))],
    textSourceIds: [...new Set(chapter.sections.flatMap(section =>
      [section.sourceId, ...(section.textSourceIds ?? [])]).filter((id): id is string => Boolean(id)))],
    warning: [...new Set(chapter.sections.map(section => section.warning).filter(Boolean))].join("\n") || undefined
  };
}

export function chapterPostRows<T extends Row>(section: ChapterSection, rowsById: ReadonlyMap<string, T>): T[] {
  return sortProjectRequirementsBySource(section.requirementIds.flatMap(id => {
    const row = rowsById.get(id);
    return row ? [row] : [];
  }));
}

/** Saved requirement IDs are the identity. Legacy parent numbers are resolved
 * only through an explicit parent reference in the same document and scope,
 * with source-order evidence. Ambiguous links never choose an arbitrary parent. */
export function buildChapterWorkspace(requirements: Row[]): ChapterWorkspace {
  const rows = sortProjectRequirementsBySource(requirements.filter(row => !["rejected", "superseded"].includes(String(row.status))).map(requirementSnapshot));
  const purchasable = new Set(visibleProjectRequirements(rows).map(row => row.id));
  const sources: ChapterWorkspace["sources"] = {}, ancestors: ChapterWorkspace["ancestors"] = {};
  const scope = (row: Row) => JSON.stringify([row.source_technical_description_document_id ?? row.source_document_id ?? "", record(row.value_json).postScope ?? ""]);
  const graph = resolvePostParents(rows), parentById = graph.parents, unlinked = graph.unresolved;
  const children = new Map<string, Row[]>();
  for (const row of rows) {
    const parent = parentById.get(row.id);
    if (parent) children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  for (const row of rows) {
    const own = currentPostRequirement(row), value = record(own.value_json);
    const pages = [...new Set([Number(row.source_page), ...(Array.isArray(value.sourcePages) ? value.sourcePages.map(Number) : [])])].filter(page => Number.isSafeInteger(page) && page > 0);
    sources[row.id] = { id: row.id, number: projectRequirementOrderPostNumber(row) ?? "", title: String(row.value_text ?? row.display_name ?? "Rubrik saknas"),
      text: String(ownRequirementBody(value) ?? value.pdfDescriptionText ?? value.sourceText ?? value.technicalSpecification ?? own.source_excerpt ?? ""), pages, parentId: parentById.get(row.id) };
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
  // Preservation rows are not chapter evidence. Keep their source records
  // intact, but distinguish verified page metadata, duplicate readings and
  // uncertain prose from the numbered chapter navigation, including old imports.
  const reviewRoots: Row[] = [];
  roots = roots.filter(row => {
    if (children.has(row.id)) return true;
    const value = record(row.value_json), flags = Array.isArray(value.reviewFlags) ? value.reviewFlags : [];
    const number = sources[row.id].number, original = String(value.sourceText ?? row.source_excerpt ?? "");
    const sameSource = (other: Row) => scope(other) === scope(row) && Number(other.source_page) <= Number(row.source_page);
    if (flags.includes("unassigned-source-text")) {
      const header = original.trim().match(/^Område:\s*(\d+(?:\.\d+)*)\s+([^\r\n]+)$/i);
      const verifiedHeader = header && rows.some(other => other.id !== row.id && sameSource(other)
        && sources[other.id].number === header[1]
        && !reviewFlags(other).includes("unassigned-source-text") && !reviewFlags(other).includes("unverified-post-source")
        && normalizeText(sources[other.id].title) === normalizeText(header[2]));
      if (!verifiedHeader) reviewRoots.push(row);
      return false;
    }
    // A leading chapter reading may already exist as its explicit post cell.
    // Suppress only an exact same-page duplicate; preserve any additional prose.
    const duplicate = !number && flags.includes("project-information") && rows.some(other => other.id !== row.id
      && sameSource(other) && Number(other.source_page) === Number(row.source_page) && sources[other.id].number
      && !reviewFlags(other).includes("unverified-post-source")
      && normalizeText(original) === normalizeText(record(other.value_json).sourceText ?? other.source_excerpt));
    if (duplicate) return false;
    const verifiedChapter = value.chapterInformation === true || (number
      && Number(record(value.sourceChapter).sourcePage) === Number(row.source_page)
      && String(record(value.sourceChapter).title ?? "").startsWith(number + " "));
    // An extra parser row not found in the post column, or a recovered number
    // with only an NS-code fragment, must not become a main chapter by default.
    const codeOnly = flags.includes("recovered-source-post") && typeof value.nsCode === "string"
      && normalizeText(original) === normalizeText(number + " " + value.nsCode);
    if (!verifiedChapter && (flags.includes("unverified-post-source") || codeOnly)) {
      reviewRoots.push(row); return false;
    }
    return true;
  });
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
  if (reviewRoots.length) chapters.push({ id: "source-review", kind: "review", sourceId: null, number: "", title: "PDF-text att kontrollera",
    sections: reviewRoots.map(row => ({ id: row.id, sourceId: row.id, number: "",
      title: "PDF-sida " + sources[row.id].pages.join(", ") + (sources[row.id].number ? " · " + sources[row.id].number : ""),
      requirementIds: [], warning: "Texten saknar en säker kapitel- eller postkoppling och har bevarats för kontroll. Den används inte som gemensamt krav för andra poster." })) });
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
function normalizeText(value: unknown) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim(); }
function reviewFlags(row: Row): unknown[] { const flags = record(row.value_json).reviewFlags; return Array.isArray(flags) ? flags : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
