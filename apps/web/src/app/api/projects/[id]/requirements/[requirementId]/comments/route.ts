import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { isUuid } from "@/lib/distributor-product-mapping";
import { validateProductPostComment, type ProductPostComment } from "@/lib/product-post-comments";
import { insertUserRowReturning, selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string; requirementId: string }> };
const commentFields = "id,body,product_number,product_name,author_name,created_at";

async function authorize(context: RouteContext, write: boolean) {
  const auth = await requireOrganizationApi(["project.requirement.view"]);
  if (auth.error) return { error: auth.error };
  if (write && !auth.context.permissions.includes("project.product_suggestion.create")) {
    return { error: NextResponse.json({ error: "Du har inte behörighet att kommentera." }, { status: 403 }) };
  }
  const { id, requirementId } = await context.params;
  if (!isUuid(id) || !isUuid(requirementId)) return { error: NextResponse.json({ error: "Ogiltig produktpost." }, { status: 400 }) };
  const filters = { project_id: `eq.${id}`, requirement_id: `eq.${requirementId}`, organization_id: `eq.${auth.context.organization.id}` };
  const [requirement] = await selectUserRows("project_requirements", {
    select: "id", id: `eq.${requirementId}`, project_id: filters.project_id,
    organization_id: filters.organization_id, deleted_at: "is.null", limit: "1"
  });
  if (!requirement) return { error: NextResponse.json({ error: "Produktposten hittades inte." }, { status: 404 }) };
  return { auth, id, requirementId, filters };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const scope = await authorize(context, false);
    if (scope.error) return scope.error;
    const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({ error: "Ogiltig sida." }, { status: 400 });
    const comments = await selectUserRows<ProductPostComment>("product_post_comments", {
      ...scope.filters, select: commentFields, order: "created_at.desc,id.desc", limit: "51", offset: String(offset)
    });
    return NextResponse.json({ comments: comments.slice(0, 50), nextOffset: comments.length > 50 ? offset + 50 : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const scope = await authorize(context, true);
    if (scope.error) return scope.error;
    const input = validateProductPostComment(await request.json().catch(() => null));
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const authorName = (scope.auth.user.user_metadata?.full_name || scope.auth.user.email || "Projektmedlem").slice(0, 200);
    let comment: ProductPostComment;
    try {
      comment = await insertUserRowReturning<ProductPostComment>("product_post_comments", {
        ...input.data, organization_id: scope.auth.context.organization.id,
        project_id: scope.id, requirement_id: scope.requirementId, author_name: authorName
      });
    } catch (error) {
      // A retry after a lost response must not create a duplicate comment.
      if (!(error instanceof UserSupabaseError) || error.code !== "23505") throw error;
      const [existing] = await selectUserRows<ProductPostComment>("product_post_comments", {
        ...scope.filters, select: commentFields, id: `eq.${input.data.id}`, author_id: `eq.${scope.auth.user.id}`, limit: "1"
      });
      if (!existing || existing.body !== input.data.body || existing.product_number !== input.data.product_number) throw error;
      comment = existing;
    }
    return NextResponse.json({ comment });
  } catch (error) { return errorResponse(error); }
}

function errorResponse(error: unknown) {
  const denied = error instanceof UserSupabaseError && (error.status === 401 || error.status === 403 || error.code === "42501");
  const unavailable = error instanceof UserSupabaseError && ["42P01", "PGRST205"].includes(error.code ?? "");
  return NextResponse.json({ error: denied ? "Du har inte behörighet till kommentarerna."
    : unavailable ? "Kommentarer är inte tillgängliga ännu. Försök igen efter uppdateringen."
    : "Kommentaren kunde inte hämtas eller sparas. Försök igen." }, { status: denied ? 403 : unavailable ? 503 : 500 });
}
