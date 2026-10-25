import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, selectAllUserRows, selectUserRows } from "@/lib/supabase-user-rest";
import { isUuid } from "@/lib/distributor-product-mapping";
import { buildDocumentChapterWorkspace } from "@/lib/document-chapter-workspace";
import type { ChapterPage } from "@/lib/pdf-chapter-navigation";
export const runtime = "nodejs";
export const maxDuration = 60;
type Row = Record<string, unknown> & { id: string };
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOrganizationApi(["project.requirement.view"]);
    if (auth.error) return auth.error;
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    const scope = { project_id: `eq.${id}`, organization_id: `eq.${auth.context.organization.id}` };
    const [project] = await selectUserRows("projects", { id: `eq.${id}`, organization_id: scope.organization_id, deleted_at: "is.null", select: "id", limit: "1" });
    if (!project) return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
    // One read per workspace, never per post click. Only ancestor source text is
    // returned; full post details and product matching remain lazy and separate.
    const [rows,pages,ancestorContext] = await Promise.all([
      selectAllUserRows<Row>("project_requirements", { ...scope, deleted_at: "is.null",
        select: "id,value_text,display_name,value_json,source_excerpt,source_page,source_document_id,source_technical_description_document_id,status,created_at", order: "id.asc" }, { pagination: "id" }),
      selectAllUserRows<ChapterPage & {id:string}>("document_pages", { ...scope,
        select:"id,document_id,page_number,heading_layout:metadata->chapter_navigation", order:"id.asc" }, {pagination:"id"}),
      callUserRpc<Row[]>("read_post_hierarchy_context", {pid:id})
    ]);
    // Older imports retain the full geometry. New imports have a compact
    // header projection, so large PDF pages need not be transferred again.
    const legacy = pages.some(page => !page.heading_layout) ? await selectAllUserRows<ChapterPage & {id:string}>("document_pages", {...scope,
      "metadata->chapter_navigation":"is.null", "metadata->heading_layout":"not.is.null",
      select:"id,document_id,page_number,heading_layout:metadata->heading_layout",order:"id.asc"},{pagination:"id"}) : [];
    const oldById = new Map(legacy.map(page => [page.id,page]));
    const visibleIds = new Set(rows.map(row => row.id));
    const contextualRows = [...rows,...ancestorContext.filter(row => !visibleIds.has(row.id))];
    return NextResponse.json(buildDocumentChapterWorkspace(contextualRows,pages.map(page => oldById.get(page.id) ?? page)), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Kapitlen kunde inte hämtas. Försök igen." }, { status: 503 });
  }
}
