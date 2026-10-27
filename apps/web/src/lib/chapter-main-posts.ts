import { organizedChapterWorkspace } from "./chapter-organization";
import { groupProductsByMainPost, type HierarchyRow } from "./project-post-hierarchy";
import { chapterPostSection, type ChapterWorkspace, type WorkspaceChapter } from "./project-chapter-workspace";

/** Both views are projections of the same saved IDs; no source row is copied. */
export function withMainPostGroups(workspace: ChapterWorkspace, rows: readonly HierarchyRow[]): ChapterWorkspace {
  const products = new Set(workspace.chapters.flatMap(chapter => chapterPostSection(chapter).requirementIds));
  const groups = groupProductsByMainPost(rows, products);
  const chapterByProduct = new Map(workspace.chapters.flatMap(chapter => chapterPostSection(chapter).requirementIds.map(id => [id,chapter.id] as const)));
  const ownerByGroup = new Map(groups.map(group => {
    const sourceChapter = group.sourceId && workspace.chapters.find(chapter => chapter.sourceId === group.sourceId
      || chapter.sections.some(section => section.sourceId === group.sourceId || section.textSourceIds?.includes(group.sourceId!)));
    return [group.id,sourceChapter ? sourceChapter.id : chapterByProduct.get(group.requirementIds[0])];
  }));
  return { ...workspace, chapters: workspace.chapters.map(chapter => {
    const mainPosts = groups.filter(group => ownerByGroup.get(group.id) === chapter.id);
    const owned = new Set(mainPosts.flatMap(group => group.requirementIds));
    const sections = chapter.sections.map(section => ({...section,requirementIds:section.requirementIds.filter(id => owned.has(id))}));
    const placed = new Set(sections.flatMap(section => section.requirementIds));
    // A continuation caption cannot split a verified main-post family. Keep
    // its actual source chapter and move only the view's product references.
    for (const group of mainPosts) {
      const remaining = group.requirementIds.filter(id => !placed.has(id));
      if (remaining.length) sections.push({id:`main:${group.id}`,sourceId:group.sourceId,number:group.number,title:group.title,requirementIds:remaining});
    }
    return { ...chapter, sections, mainPosts };
  }) };

}

export function chapterWorkspaceView(workspace: ChapterWorkspace, mode: "pdf" | "main"): ChapterWorkspace {
  workspace = organizedChapterWorkspace(workspace);
  // Hide preserved, unplaced text in navigation; review groups containing
  // actual product posts and ordinary information chapters remain visible.
  const visibleChapters = workspace.chapters.filter(chapter => chapter.kind !== "review" || chapterPostSection(chapter).requirementIds.length > 0);
  if (mode === "pdf") return { ...workspace, chapters: visibleChapters };
  const chapters: WorkspaceChapter[] = visibleChapters.flatMap(chapter => {
    if (!chapter.mainPosts?.length) return [chapter];
    const groups: WorkspaceChapter[] = chapter.mainPosts.map(group => ({
      id: `main:${chapter.id}:${group.id}`, sourceId: group.standalone ? null : group.sourceId,
      number: group.number, title: group.title, kind: group.sourceId ? "main-post" as const : "review" as const,
      mainPosts: [group], sections: [{ id: group.id, sourceId: group.standalone ? null : group.sourceId,
        number: group.number, title: group.title, requirementIds: group.requirementIds,
        textSourceIds: [...new Set(group.requirementIds.flatMap(id => workspace.ancestors[id] ?? []))],
        ...(group.review ? { warning: "Huvudpostkopplingen behöver kontrolleras. Originalposten är bevarad." } : {}) }]
    }));
    // Manually placed chapter text stays accessible when products are shown as
    // main-post chapters; it is never copied into every product family's text.
    if (chapter.manualTextSourceIds?.length) groups.push({ id: `${chapter.id}:manual-text`, sourceId: null,
      number: chapter.number, title: chapter.title, kind: chapter.kind,
      sections: [{ id: `${chapter.id}:manual-text`, sourceId: null, number: chapter.number, title: chapter.title,
        requirementIds: [], textSourceIds: chapter.manualTextSourceIds }] });
    return groups;
  });
  return { ...workspace, chapters };
}
