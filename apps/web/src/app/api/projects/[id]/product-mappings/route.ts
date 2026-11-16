import { NextResponse } from "next/server";
import { isUuid, validateDistributorProductChoices } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { productRequirementChecks, validateRequirementReview } from "@/lib/product-requirement-review";
import { callUserRpc, selectUserRows } from "@/lib/supabase-user-rest";
import { productChoiceError, validEditRevision } from "@/lib/product-choice-error";
import { loadEffectiveRequirement } from "@/lib/effective-requirements.server";
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
    const validation = validateDistributorProductChoices({ ...body, products: body?.products ?? [body] });
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
    const effective = await loadEffectiveRequirement(id, input.requirementId, authorization.context.organization.id);
    if (!effective || body.requirementRevision !== effective.effectiveRequirements.revision) {
      return NextResponse.json({ error: "Kravgrunnlaget er endret. Last inn produktkortet og kontroller valget på nytt." }, { status: 409 });
    }
    const products = [];
    for (const product of input.products) {
      const review = product.requirementReview
        ? validateRequirementReview(requirement, product, product.requirementReview) : { data: null };
      if ("error" in review) return NextResponse.json({ error: review.error }, { status: 400 });
      products.push({ ...product, requirementReview: review.data
        ? { ...review.data, checks: productRequirementChecks(requirement) } : null });
    }
    const result = await callUserRpc("save_product_choices", {
      requested_project_id: id, requested_requirement_id: input.requirementId,
      requested_revision: body.expectedRevision, requested_products: products,
      requested_legacy: !Array.isArray(body.products)
    });
    return NextResponse.json({ mapping: result, message: "Produktvalen och tillbehören är godkända och sparade." });
  } catch (error) { return productChoiceError(error); }
}

/** Clear a saved choice explicitly; an incomplete approval must never erase it. */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.product_suggestion.create"]);
    if (authorization.error) return authorization.error;
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!isUuid(id) || !isUuid(body?.requirementId)) {
      return NextResponse.json({ error: "Ogiltig produktpost." }, { status: 400 });
    }
    if (!validEditRevision(body?.expectedRevision)) {
      return NextResponse.json({ error: "Ladda om produktkortet innan du sparar." }, { status: 409 });
    }
    const [requirement] = await selectUserRows("project_requirements", {
      select: "id", id: `eq.${body.requirementId}`, project_id: `eq.${id}`,
      organization_id: `eq.${authorization.context.organization.id}`, deleted_at: "is.null", limit: "1"
    });
    if (!requirement) return NextResponse.json({ error: "Produktposten kunde inte hittas." }, { status: 404 });
    const result = await callUserRpc("clear_product_choice", {
      requested_project_id: id, requested_requirement_id: body.requirementId,
      requested_revision: body.expectedRevision
    });
    return NextResponse.json({ ...result as object, message: "Produktvalget er fjernet. Posten er åpen igjen." });
  } catch (error) { return productChoiceError(error); }
}
