import { chapterPostSection, type ChapterSource, type ChapterWorkspace, type WorkspaceChapter } from "./project-chapter-workspace";

export type ChapterOrganization = {
  revision: number;
  customChapters: { id: string; title: string }[];
  placements: Record<string, string>;
};
export const emptyChapterOrganization = (): ChapterOrganization => ({ revision: 0, customChapters: [], placements: {} });

export function organizationTargets(workspace: ChapterWorkspace): WorkspaceChapter[] {
  return [...workspace.chapters.filter(chapter => chapter.kind !== "review"),
    ...(workspace.organization?.customChapters ?? []).map(chapter => ({ ...chapter, kind: "custom" as const,
      sourceId: null, number: "", sections: [] }))];
}

export type OrganizationSource = ChapterSource & { requirementIds: string[] };
/** Operates on the original workspace. A main post and its products form one
 * moveable entry, so manual placement can never split a product family. */
export function organizationSources(workspace: ChapterWorkspace): OrganizationSource[] {
  const entries = new Map<string, OrganizationSource>();
  const review = workspace.chapters.filter(chapter => chapter.kind === "review");
  for (const chapter of review) {
    for (const group of chapter.mainPosts ?? []) {
      const id = group.sourceId ?? group.requirementIds[0];
      const source = workspace.sources[id];
      if (source) entries.set(id, { ...source, requirementIds: group.requirementIds });
    }
    for (const id of [chapter.sourceId, ...chapter.sections.flatMap(section =>
      [section.sourceId, ...(section.textSourceIds ?? []), ...section.requirementIds])]) {
      if (!id || entries.has(id) || [...entries.values()].some(entry => entry.requirementIds.includes(id))) continue;
      const source = workspace.sources[id];
      if (source) entries.set(id, { ...source, requirementIds: chapterPostSection(chapter).requirementIds.includes(id) ? [id] : [] });
    }
  }
  return [...entries.values()];
}

export function organizedChapterWorkspace(workspace: ChapterWorkspace): ChapterWorkspace {
  if (!workspace.organization) return workspace;
  const sources = new Map(organizationSources(workspace).map(source => [source.id, source]));
  const targets = organizationTargets(workspace), targetIds = new Set(targets.map(chapter => chapter.id));
  const placements = Object.entries(workspace.organization.placements)
    .filter(([source, target]) => sources.has(source) && targetIds.has(target));
  const moved = new Set(placements.flatMap(([source]) => [source, ...sources.get(source)!.requirementIds]));
  const groups = workspace.chapters.flatMap(chapter => chapter.mainPosts ?? []);
  const detach = (chapter: WorkspaceChapter): WorkspaceChapter => ({ ...chapter,
    sourceId: chapter.sourceId && moved.has(chapter.sourceId) ? null : chapter.sourceId,
    mainPosts: chapter.mainPosts?.filter(group => !group.requirementIds.some(id => moved.has(id))),
    sections: chapter.sections.map(section => ({ ...section,
      sourceId: section.sourceId && moved.has(section.sourceId) ? null : section.sourceId,
      requirementIds: section.requirementIds.filter(id => !moved.has(id)),
      textSourceIds: section.textSourceIds?.filter(id => !moved.has(id))
    })).filter(section => section.sourceId || section.requirementIds.length || section.textSourceIds?.length)
  });
  const chapters = [...workspace.chapters.map(detach), ...targets.filter(chapter => chapter.kind === "custom")];
  for (const chapter of chapters) {
    const entries = placements.filter(([,target]) => target === chapter.id).map(([source]) => sources.get(source)!);
    if (!entries.length) continue;
    // Only independent text needs a separate information entry in main-post
    // view. Main-post source text travels with its original product group.
    chapter.manualTextSourceIds = entries.filter(entry => !entry.requirementIds.length).map(entry => entry.id);
    const products = new Set(entries.flatMap(entry => entry.requirementIds));
    chapter.mainPosts = [...(chapter.mainPosts ?? []), ...groups.filter(group => group.requirementIds.some(id => products.has(id)))];
    chapter.sections = [...chapter.sections, ...entries.map(entry => ({
      id: `${chapter.id}:manual:${entry.id}`, sourceId: entry.requirementIds.includes(entry.id) ? null : entry.id,
      number: entry.number, title: entry.title, requirementIds: entry.requirementIds,
      textSourceIds: entry.requirementIds.includes(entry.id) ? [] : [entry.id]
    }))];
  }
  return { ...workspace, chapters: chapters.filter(chapter => chapter.kind !== "review" || chapter.sections.length > 0) };
}

export type ChapterOrganizationChange = { revision: number; sourceIds: string[]; targetId: string | null; newTitle: string | null };
export function validateChapterOrganizationChange(input: unknown, workspace: ChapterWorkspace): ChapterOrganizationChange | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Välj poster och kapitel." };
  const body = input as Record<string, unknown>;
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) return { error: "Läs in kapitlen på nytt." };
  const valid = new Set(organizationSources(workspace).map(source => source.id));
  if (!Array.isArray(body.sourceIds) || body.sourceIds.length < 1 || body.sourceIds.length > 500
    || new Set(body.sourceIds).size !== body.sourceIds.length
    || body.sourceIds.some(id => typeof id !== "string" || !valid.has(id))) return { error: "Välj 1–500 tillgängliga poster eller huvudposter." };
  const newTitle = typeof body.newTitle === "string" ? body.newTitle.trim() : null;
  if (body.newTitle != null && (!newTitle || newTitle.length > 160)) return { error: "Kapitelnamnet ska vara 1–160 tecken." };
  const targetId = typeof body.targetId === "string" ? body.targetId : null;
  if (body.targetId != null && !targetId || targetId && newTitle) return { error: "Välj ett befintligt kapitel eller skapa ett nytt." };
  if (targetId && !organizationTargets(workspace).some(chapter => chapter.id === targetId)) return { error: "Kapitlet finns inte längre. Läs in kapitlen på nytt." };
  return { revision: Number(body.revision), sourceIds: body.sourceIds as string[], targetId, newTitle };
}
