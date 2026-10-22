import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { selectAllUserRows, selectUserRows } from "@/lib/supabase-user-rest";
import { isUuid } from "@/lib/distributor-product-mapping";
import { buildChapterWorkspace } from "@/lib/project-chapter-workspace";
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
    const rows = await selectAllUserRows<Row>("project_requirements", { ...scope, deleted_at: "is.null",
      select: "id,value_text,display_name,value_json,source_excerpt,source_page,source_document_id,source_technical_description_document_id,status,created_at,reviewed_at,reviewed_by", order: "id.asc" }, { pagination: "id" });
    return NextResponse.json(buildChapterWorkspace(rows), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Kapitlen kunde inte hämtas. Försök igen." }, { status: 503 });
  }
}
