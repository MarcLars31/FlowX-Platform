import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, UserSupabaseError } from "@/lib/supabase-user-rest";
import { isUuid } from "@/lib/distributor-product-mapping";
import { loadProjectChapterWorkspace } from "@/lib/project-chapter-workspace.server";
import { validateChapterOrganizationChange, type ChapterOrganization } from "@/lib/chapter-organization";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

async function load(context: Context) {
  const auth = await requireOrganizationApi(["project.requirement.view"]);
  if (auth.error) return { error: auth.error };
  const { id } = await context.params;
  if (!isUuid(id)) return { error: json({ error: "Ogiltigt projekt-id." }, 400) };
  const workspace = await loadProjectChapterWorkspace(id, auth.context.organization.id);
  if (!workspace) return { error: json({ error: "Projektet hittades inte." }, 404) };
  return { id, workspace, error: null };
}
export async function GET(_request: Request, context: Context) {
  try { const result = await load(context); return result.error ?? json(result.workspace); }
  catch (error) { return failed(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    const result = await load(context);
    if (result.error) return result.error;
    if (!result.workspace.canOrganize) return json({ error: "Projektansvarig kan ändra kapitelplaceringen." }, 403);
    const change = validateChapterOrganizationChange(await readJsonBody(request, 50_000), result.workspace);
    if ("error" in change) return json(change, 400);
    const organization = await callUserRpc<ChapterOrganization>("save_individual_chapter_organization", {
      pid: result.id, expected_revision: change.revision, source_ids: change.sourceIds, target_id: change.targetId, new_title: change.newTitle, normalized_placements: result.workspace.organization?.placements ?? {}
    });
    return json({ organization });
  } catch (error) { return failed(error); }
}
function failed(error: unknown) {
  if (error instanceof RequestBodyTooLargeError) return json({ error: "Välj färre poster åt gången." }, 413);
  if (error instanceof SyntaxError) return json({ error: "Ogiltig kapitelplacering." }, 400);
  if (error instanceof UserSupabaseError) {
    if (error.code === "40001") return json({ error: "Kapitelplaceringen har ändrats av någon annan. Ladda om sidan och försök igen." }, 409);
    if (error.code === "42501" || error.status === 403 || error.status === 401) return json({ error: "Du saknar behörighet att ändra kapitelplaceringen." }, 403);
    if (error.code === "22023") return json({ error: "Kontrollera valda poster och kapitel. Högst 200 egna kapitel kan skapas." }, 400);
  }
  return json({ error: "Kapitlen kunde inte läsas eller sparas. Försök igen." }, 503);
}
