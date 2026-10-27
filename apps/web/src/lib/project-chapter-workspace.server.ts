import "server-only";
import { callUserRpc, selectAllUserRows, selectUserRows } from "./supabase-user-rest";
import { buildDocumentChapterWorkspace } from "./document-chapter-workspace";
import { emptyChapterOrganization, type ChapterOrganization } from "./chapter-organization";
import type { ChapterPage } from "./pdf-chapter-navigation";
import type { ChapterWorkspace } from "./project-chapter-workspace";
type Row = Record<string, unknown> & { id: string };

export async function loadProjectChapterWorkspace(id: string, organizationId: string): Promise<ChapterWorkspace | null> {
  const scope = { project_id: `eq.${id}`, organization_id: `eq.${organizationId}` };
  const [project] = await selectUserRows("projects", { id: `eq.${id}`, organization_id: scope.organization_id, deleted_at: "is.null", select: "id", limit: "1" });
  if (!project) return null;
  const [rows,pages,ancestorContext,organizations,canOrganize] = await Promise.all([
    selectAllUserRows<Row>("project_requirements", { ...scope, deleted_at: "is.null",
      select: "id,value_text,display_name,value_json,source_excerpt,source_page,source_document_id,source_technical_description_document_id,status,created_at", order: "id.asc" }, { pagination: "id" }),
    selectAllUserRows<ChapterPage & {id:string}>("document_pages", { ...scope,
      select:"id,document_id,page_number,heading_layout:metadata->chapter_navigation", order:"id.asc" }, {pagination:"id"}),
    callUserRpc<Row[]>("read_post_hierarchy_context", {pid:id}),
    selectUserRows<{ revision: number; custom_chapters: ChapterOrganization["customChapters"]; placements: ChapterOrganization["placements"] }>("project_chapter_organization", { ...scope, select:"revision,custom_chapters,placements", limit:"1" }),
    callUserRpc<boolean>("is_delivery_manager", {pid:id})
  ]);
  const legacy = pages.some(page => !page.heading_layout) ? await selectAllUserRows<ChapterPage & {id:string}>("document_pages", {...scope,
    "metadata->chapter_navigation":"is.null", "metadata->heading_layout":"not.is.null",
    select:"id,document_id,page_number,heading_layout:metadata->heading_layout",order:"id.asc"},{pagination:"id"}) : [];
  const oldById = new Map(legacy.map(page => [page.id,page]));
  const visibleIds = new Set(rows.map(row => row.id));
  const contextualRows = [...rows,...ancestorContext.filter(row => !visibleIds.has(row.id))];
  const saved = organizations[0];
  return { ...buildDocumentChapterWorkspace(contextualRows,pages.map(page => oldById.get(page.id) ?? page)), canOrganize,
    organization: saved ? { revision: Number(saved.revision), customChapters: saved.custom_chapters, placements: saved.placements } : emptyChapterOrganization() };
}
