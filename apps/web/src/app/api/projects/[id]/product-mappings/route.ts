import { NextResponse } from "next/server";
import { isUuid, validateDistributorProductMapping } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { readProductSelectionReview, PRODUCT_DEVIATION_LABEL, PRODUCT_REVIEW_LABEL } from "@/lib/product-selection-review";
import { productRequirementChecks, validateRequirementReview } from "@/lib/product-requirement-review";
import { callUserRpc, selectUserRows } from "@/lib/supabase-user-rest";
import { productChoiceError, validEditRevision } from "@/lib/product-choice-error";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi([
      "project.product_suggestion.create"
    ]);
    if (authorization.error) return authorization.error;

    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    if (!validEditRevision(body?.expectedRevision)) return NextResponse.json({ error: "Ladda om produktkortet innan du sparar." }, { status: 409 });
    const validation = validateDistributorProductMapping(body);
    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const input = validation.data;
    const [requirement] = await selectUserRows<Record<string, unknown> & { updated_at: string }>("project_requirements", {
      select: "id,requirement_key,category,value_text,value_json,source_excerpt,source_page,updated_at",
      id: `eq.${input.requirementId}`, project_id: `eq.${id}`,
      organization_id: `eq.${authorization.context.organization.id}`, deleted_at: "is.null", limit: "1"
    });
    if (!requirement) return NextResponse.json({ error: "Produktposten kunde inte hittas." }, { status: 404 });
    // The product flow uses explicit approval after reading the specification,
    // not a mandatory per-requirement checklist. Validate legacy reviews only
    // when a client actually submits one; never invent completed decisions.
    const review = input.requirementReview
      ? validateRequirementReview(requirement, input, input.requirementReview)
      : { data: null };
    if ("error" in review) return NextResponse.json({ error: review.error }, { status: 400 });
    const result = await callUserRpc("save_product_choice", {
      requested_project_id: id, requested_requirement_id: input.requirementId,
      requested_revision: body.expectedRevision, requested_action: "approve",
      requested_input: { ...input, requirementReview: review.data ? { ...review.data, checks: productRequirementChecks(requirement) } : null }
    });

    return NextResponse.json({
      mapping: result,
      message: review.data ? "Postens produktval och kravgenomgång är godkända och sparade."
        : readProductSelectionReview(input.notes)
        ? `Produktvalet är sparat som ”${readProductSelectionReview(input.notes)?.status === "mismatch" ? PRODUCT_DEVIATION_LABEL : PRODUCT_REVIEW_LABEL}”. Märkningen finns kvar i produktlistan.`
        : "Produkten är godkänd och sparad. Kopplingen kan nu föreslås i kommande liknande projekt."
    });
  } catch (error) { return productChoiceError(error); }
}
