import { NextResponse } from "next/server";
import { isUuid } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc } from "@/lib/supabase-user-rest";
import { productChoiceError, validEditRevision } from "@/lib/product-choice-error";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireOrganizationApi(["project.product_suggestion.create"]);
    if (auth.error) return auth.error;
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!isUuid(id) || !isUuid(body?.requirementId) || ![null, "not_in_assortment"].includes(body?.resolution))
      return NextResponse.json({ error: "Ogiltig produktmärkning." }, { status: 400 });
    if (!validEditRevision(body?.expectedRevision)) return NextResponse.json({ error: "Ladda om produktkortet innan du sparar." }, { status: 409 });
    const result = await callUserRpc("save_product_choice", {
      requested_project_id: id, requested_requirement_id: body.requirementId, requested_revision: body.expectedRevision,
      requested_action: body.resolution === null ? "clear_resolution" : "not_in_assortment", requested_input: {}
    });
    return NextResponse.json({ ...result as object, resolution: body.resolution, message: "Märkningen är sparad." });
  } catch (error) { return productChoiceError(error); }
}
