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

export type OrganizationSource = ChapterSource & { requirementIds: string[]; groupId?: string; groupTitle?: string };
/** Each saved source is selectable independently. The group label is only for
 * navigation; changing a chapter never rewrites the original parent relation. */
export function organizationSources(workspace: ChapterWorkspace): OrganizationSource[] {
  const entries = new Map<string, OrganizationSource>();
  for (const chapter of workspace.chapters.filter(chapter => chapter.kind === "review")) {
    const products = new Set(chapterPostSection(chapter).requirementIds);
    const add = (id: string | null, group?: { id: string; title: string }) => {
      if (!id || !workspace.sources[id]) return;
      const source = workspace.sources[id];
      entries.set(id, { ...source, requirementIds: products.has(id) ? [id] : [],
        ...(group ? { groupId: group.id, groupTitle: group.title } : {}) });
    };
    for (const group of chapter.mainPosts ?? []) {
      const label = !group.standalone && group.sourceId
        ? { id: group.id, title: [group.number,group.title].filter(Boolean).join(" ") } : undefined;
      if (group.sourceId) add(group.sourceId, label);
      group.requirementIds.forEach(id => add(id, label));
    }
    for (const id of [chapter.sourceId, ...chapter.sections.flatMap(section =>
      [section.sourceId, ...(section.textSourceIds ?? []), ...section.requirementIds])]) {
      if (id && !entries.has(id)) add(id);
    }
  }
  return [...entries.values()];
}

/** Older placements addressed a whole family by its parent ID. Expand them
 * once on read, then persist atomically with the next individual change. */
export function expandLegacyChapterPlacements(workspace: ChapterWorkspace, organization: ChapterOrganization): ChapterOrganization {
  const placements = { ...organization.placements };
  for (const chapter of workspace.chapters.filter(chapter => chapter.kind === "review")) {
    for (const group of chapter.mainPosts ?? []) {
      const target = group.sourceId && organization.placements[group.sourceId];
      if (target) for (const id of group.requirementIds) placements[id] ??= target;
    }
  }
  return { ...organization, placements };
}

export function organizedChapterWorkspace(workspace: ChapterWorkspace): ChapterWorkspace {
  if (!workspace.organization) return workspace;
  const sources = new Map(organizationSources(workspace).map(source => [source.id, source]));
  const targets = organizationTargets(workspace), targetIds = new Set(targets.map(chapter => chapter.id));
  const placements = Object.entries(workspace.organization.placements)
    .filter(([source, target]) => sources.has(source) && targetIds.has(target));
  const moved = new Set(placements.map(([source]) => source));
  const groups = workspace.chapters.flatMap(chapter => chapter.mainPosts ?? []);
  const detach = (chapter: WorkspaceChapter): WorkspaceChapter => ({ ...chapter,
    sourceId: chapter.sourceId && moved.has(chapter.sourceId) ? null : chapter.sourceId,
    mainPosts: chapter.mainPosts?.map(group => ({ ...group, requirementIds: group.requirementIds.filter(id => !moved.has(id)) }))
      .filter(group => group.requirementIds.length > 0),
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
    chapter.manualTextSourceIds = entries.filter(entry => !entry.requirementIds.length).map(entry => entry.id);
    const products = new Set(entries.flatMap(entry => entry.requirementIds));
    // A main post may appear in several chapters, each showing only the
    // products actually placed there. Its original requirements stay readable.
    const incoming = groups.map(group => ({ ...group, requirementIds: group.requirementIds.filter(id => products.has(id)) }))
      .filter(group => group.requirementIds.length > 0);
    chapter.mainPosts = [...(chapter.mainPosts ?? []), ...incoming];
    chapter.sections = [...chapter.sections, ...entries.map(entry => ({
      id: `${chapter.id}:manual:${entry.id}`, sourceId: entry.requirementIds.length ? null : entry.id,
      number: entry.number, title: entry.title, requirementIds: entry.requirementIds,
      textSourceIds: entry.requirementIds.length ? [] : [entry.id]
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
