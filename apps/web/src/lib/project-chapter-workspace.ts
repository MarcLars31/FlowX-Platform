import { visibleProjectRequirements } from "./project-requirement-views";
import { projectRequirementOrderPostNumber, sortProjectRequirementsBySource } from "./project-requirement-order";
import { currentPostRequirement } from "./current-post-requirement";
import { requirementSnapshot } from "./requirement-snapshot";
import { projectRequirementHierarchy } from "./project-requirement-hierarchy";
import { projectRequirementScope } from "./project-requirement-identity";
import { groupProductRequirementsByPdfChapter, productChapterHeading } from "./product-post-groups";

type Row = Record<string, unknown> & { id: string };
export type ChapterSource = { id: string; number: string; title: string; text: string; pages: number[]; parentId?: string };
export type ChapterSection = { id: string; sourceId: string | null; title: string; number: string; requirementIds: string[]; warning?: string };
export type WorkspaceChapter = { id: string; sourceId: string | null; title: string; number: string; sections: ChapterSection[]; kind?: "review" };
export type ChapterWorkspace = { chapters: WorkspaceChapter[]; sources: Record<string, ChapterSource>; ancestors: Record<string, string[]> };

/** Saved requirement IDs are the identity. Legacy parent numbers are resolved
 * only through an explicit parent reference in the same document and scope,
 * with source-order evidence. Ambiguous links never choose an arbitrary parent. */
export function buildChapterWorkspace(requirements: Row[]): ChapterWorkspace {
  const rows = sortProjectRequirementsBySource(requirements.filter(row => !["rejected", "superseded"].includes(String(row.status))).map(requirementSnapshot));
  const purchasable = new Set(visibleProjectRequirements(rows).map(row => row.id));
  const { parentById, children, unlinked, ancestors } = projectRequirementHierarchy(rows);
  const sources: ChapterWorkspace["sources"] = {};
  const scope = (row: Row) => JSON.stringify(projectRequirementScope(row));
  for (const row of rows) {
    const value = record(row.value_json);
    const pages = [...new Set([Number(row.source_page), ...(Array.isArray(value.sourcePages) ? value.sourcePages.map(Number) : [])])].filter(page => Number.isSafeInteger(page) && page > 0);
    sources[row.id] = { id: row.id, number: projectRequirementOrderPostNumber(row) ?? "", title: String(row.value_text ?? row.display_name ?? "Rubrik saknas"),
      text: "", pages, parentId: parentById.get(row.id) };
  }
  const information = rows.filter(row => !purchasable.has(row.id));
  const ignored = new Set<string>();
  // Preservation rows are not chapter evidence. Keep their source records
  // intact, but distinguish verified page metadata, duplicate readings and
  // uncertain prose from the numbered chapter navigation, including old imports.
  const uncertain = new Set<string>();
  const verified = information.filter(row => {
    const value = record(row.value_json), flags = Array.isArray(value.reviewFlags) ? value.reviewFlags : [];
    const number = sources[row.id].number, original = String(value.sourceText ?? row.source_excerpt ?? "");
    const sameSource = (other: Row) => scope(other) === scope(row) && Number(other.source_page) <= Number(row.source_page);
    if (flags.includes("unassigned-source-text")) {
      const header = original.trim().match(/^Område:\s*(\d+(?:\.\d+)*)\s+([^\r\n]+)$/i);
      const verifiedHeader = header && rows.some(other => other.id !== row.id && sameSource(other)
        && sources[other.id].number === header[1]
        && !reviewFlags(other).includes("unassigned-source-text") && !reviewFlags(other).includes("unverified-post-source")
        && normalizeText(sources[other.id].title) === normalizeText(header[2]));
      (verifiedHeader ? ignored : uncertain).add(row.id);
      return false;
    }
    // A leading chapter reading may already exist as its explicit post cell.
    // Suppress only an exact same-page duplicate; preserve any additional prose.
    const duplicate = !number && flags.includes("project-information") && rows.some(other => other.id !== row.id
      && sameSource(other) && Number(other.source_page) === Number(row.source_page) && sources[other.id].number
      && !reviewFlags(other).includes("unverified-post-source")
      && normalizeText(original) === normalizeText(record(other.value_json).sourceText ?? other.source_excerpt));
    if (duplicate) { ignored.add(row.id); return false; }
    const verifiedChapter = value.chapterInformation === true || (number
      && Number(record(value.sourceChapter).sourcePage) === Number(row.source_page)
      && String(record(value.sourceChapter).title ?? "").startsWith(number + " "));
    // An extra parser row not found in the post column, or a recovered number
    // with only an NS-code fragment, must not become a main chapter by default.
    const codeOnly = flags.includes("recovered-source-post") && typeof value.nsCode === "string"
      && normalizeText(original) === normalizeText(number + " " + value.nsCode);
    if (!verifiedChapter && (flags.includes("unverified-post-source") || codeOnly)) {
      uncertain.add(row.id); return false;
    }
    return true;
  });
  const blocked = new Set([...unlinked, ...uncertain, ...ignored]);
  const hasValidPath = (row: Row) => ![...ancestors[row.id], row.id].some(id => blocked.has(id));
  const assigned = new Set<string>();
  function collect(row: Row): string[] {
    if (!hasValidPath(row)) return [];
    const own = purchasable.has(row.id) ? [row.id] : [];
    own.forEach(id => assigned.add(id));
    return [...own, ...(children.get(row.id) ?? []).flatMap(collect)];
  }
  let roots = verified.filter(row => !parentById.has(row.id) && hasValidPath(row));
  // A project/object wrapper with one child is not an extra chapter-navigation
  // step. Retain it in the ancestor path and its original requirements.
  roots = roots.flatMap(root => {
    const nested = children.get(root.id) ?? [];
    return /^\d{4,6}$/.test(sources[root.id].number) && nested.length === 1 && !purchasable.has(nested[0].id) && hasValidPath(nested[0])
      ? nested : [root];
  });
  const chapters: WorkspaceChapter[] = roots.map(root => {
    const sections: ChapterSection[] = [], direct: string[] = [];
    for (const child of children.get(root.id) ?? []) {
      if (!hasValidPath(child)) continue;
      if (!purchasable.has(child.id) || children.has(child.id)) {
        const source = sources[child.id];
        sections.push({ id: child.id, sourceId: child.id, number: source.number, title: source.title, requirementIds: collect(child) });
      } else direct.push(...collect(child));
    }
    if (direct.length || !sections.length) sections.unshift({ id: root.id + ":direct", sourceId: null, number: sources[root.id].number,
      title: "Poster direkt under kapitlet", requirementIds: direct });
    return { id: root.id, sourceId: root.id, number: sources[root.id].number, title: sources[root.id].title, sections };
  });

  // Page headers are valid navigation labels even when the PDF has no matching
  // standalone chapter row. Reuse the existing grouping contract, but never
  // turn a header into common requirement text or repair a broken parent link.
  const headerPosts = rows.filter(row => purchasable.has(row.id) && !assigned.has(row.id) && hasValidPath(row) && hasSavedChapter(row));
  const byScope = new Map<string, Row[]>();
  for (const row of headerPosts) {
    const key = scope(row), scoped = byScope.get(key) ?? [];
    scoped.push(row);
    byScope.set(key, scoped);
  }
  for (const [scopeKey, scoped] of byScope) for (const group of groupProductRequirementsByPdfChapter(scoped)) {
    const id = `pdf-chapter:${JSON.stringify([scopeKey, group.key])}`;
    const heading = productChapterHeading(group.title);
    const requirementIds = group.requirements.map(row => row.id);
    requirementIds.forEach(id => assigned.add(id));
    chapters.push({ id, sourceId: null, number: heading.chapter === "—" ? "" : heading.chapter, title: heading.description,
      sections: [{ id: `${id}:direct`, sourceId: null, number: "", title: "Produktposter", requirementIds }] });
  }

  const used = new Set<string>();
  function includeSource(id: string | null) {
    if (id) { used.add(id); ancestors[id].forEach(parent => used.add(parent)); }
  }
  for (const chapter of chapters) {
    includeSource(chapter.sourceId);
    chapter.sections.forEach(section => includeSource(section.sourceId));
  }
  for (const id of assigned) ancestors[id].forEach(parent => used.add(parent));
  // A deeper information-only branch still needs an entry point. Its saved
  // ancestor path supplies context without manufacturing a product card.
  for (const row of information) {
    if (used.has(row.id) || !hasValidPath(row)) continue;
    const chapter = chapters.find(chapter => ancestors[row.id].includes(chapter.id));
    if (!chapter) continue;
    const source = sources[row.id];
    chapter.sections.push({ id: row.id, sourceId: row.id, number: source.number, title: source.title, requirementIds: [] });
    includeSource(row.id);
  }

  const positions = new Map(rows.map((row, index) => [row.id, index]));
  const chapterPosition = (chapter: WorkspaceChapter) => chapter.sourceId ? positions.get(chapter.sourceId)!
    : Math.min(...chapter.sections.flatMap(section => section.requirementIds.map(id => positions.get(id)!)));
  chapters.sort((left, right) => chapterPosition(left) - chapterPosition(right));

  const reviewRoots = information.filter(row => !used.has(row.id) && !ignored.has(row.id));
  if (reviewRoots.length) chapters.push({ id: "source-review", kind: "review", sourceId: null, number: "", title: "PDF-text att kontrollera",
    sections: reviewRoots.map(row => ({ id: row.id, sourceId: row.id, number: "",
      title: "PDF-sida " + sources[row.id].pages.join(", ") + (sources[row.id].number ? " · " + sources[row.id].number : ""),
      requirementIds: [], warning: "Texten saknar en säker kapitel- eller postkoppling och har bevarats för kontroll. Den används inte som gemensamt krav för andra poster." })) });
  for (const row of reviewRoots) { used.add(row.id); ancestors[row.id] = []; }
  const missing = rows.filter(row => purchasable.has(row.id) && !assigned.has(row.id));
  if (missing.length) chapters.push({ id: "unlinked", sourceId: null, number: "", title: "Poster utan säker kapitelkoppling",
    sections: [{ id: "unlinked:posts", sourceId: null, number: "", title: "Kontrollera kapitelkopplingen", requirementIds: missing.map(row => row.id),
      warning: "Dessa poster saknar en entydig koppling till PDF-kapitlen. Ingen kapiteltext har lagts till automatiskt." }] });
  for (const row of missing) ancestors[row.id] = [];
  // Project full text only for accessible information/ancestors. Product leaf
  // details remain lazy instead of being normalized and then discarded.
  for (const row of rows.filter(row => used.has(row.id))) {
    const own = currentPostRequirement(row), value = record(own.value_json);
    sources[row.id].text = String((record(value.headingSplit).status === "separated" ? record(value.headingSplit).requirementText : null)
      ?? value.pdfDescriptionText ?? value.sourceText ?? value.technicalSpecification ?? own.source_excerpt ?? "");
  }
  return { chapters, sources: Object.fromEntries(Object.entries(sources).filter(([id]) => used.has(id))),
    ancestors: Object.fromEntries(Object.entries(ancestors).filter(([id]) => purchasable.has(id) || used.has(id))) };
}
function hasSavedChapter(row: Row) {
  const chapter = record(record(row.value_json).sourceChapter);
  const page = Number(chapter.sourcePage);
  return typeof chapter.title === "string" && Boolean(chapter.title.trim()) && Number.isSafeInteger(page) && page > 0 && page <= Number(row.source_page);
}
export function initialSectionPost(section: ChapterSection, selected: ReadonlySet<string>, remembered?: string) {
  return remembered && section.requirementIds.includes(remembered) ? remembered
    : section.requirementIds.find(id => !selected.has(id)) ?? section.requirementIds[0] ?? null;
}
/** Changes to saved requirements invalidate navigation, while product selection
 * alone can update counts without reloading all common requirement text. */
export function chapterWorkspaceRevision(rows: Row[]) {
  return JSON.stringify(rows.map(row => [row.id, row.edit_revision ?? 0, row.updated_at ?? "", row.status ?? ""]));
}
function normalizeText(value: unknown) { return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim(); }
function reviewFlags(row: Row): unknown[] { const flags = record(row.value_json).reviewFlags; return Array.isArray(flags) ? flags : []; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
