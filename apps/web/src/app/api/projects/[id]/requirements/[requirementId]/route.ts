import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, selectUserRows, updateUserRowsReturning, UserSupabaseError } from "@/lib/supabase-user-rest";
import { isUuid } from "@/lib/distributor-product-mapping";
import { loadDistributorProductMemory } from "@/lib/distributor-product-memory";
import { requirementSnapshot } from "@/lib/requirement-snapshot";
import { compactProjectRequirement, type OverviewRow } from "@/lib/project-overview";

import { withEffectiveRequirements } from "@/lib/effective-requirements";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string; requirementId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireOrganizationApi(["project.requirement.view"]);
    if (auth.error) return auth.error;
    const { id, requirementId } = await context.params;
    if (!isUuid(id) || !isUuid(requirementId)) return NextResponse.json({ error: "Ogiltig produktpost." }, { status: 400 });
    const filters = { project_id: `eq.${id}`, organization_id: `eq.${auth.context.organization.id}` };
    const [project] = await selectUserRows("projects", { id: `eq.${id}`, organization_id: filters.organization_id, deleted_at: "is.null", select: "id", limit: "1" });
    if (!project) return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
    const [raw] = await selectUserRows<OverviewRow>("project_requirements", { ...filters, id: `eq.${requirementId}`, deleted_at: "is.null", limit: "1" });
    if (!raw) return NextResponse.json({ error: "Produktposten hittades inte." }, { status: 404 });
    const summaryOnly = new URL(request.url).searchParams.get("view") === "summary";
    const canReadProducts = auth.context.permissions.includes("project.product_suggestion.view");
    const [assignments, memory] = await Promise.all([
      canReadProducts ? selectUserRows<OverviewRow>("project_product_suggestions", { ...filters, requirement_id: `eq.${requirementId}`, status: "eq.selected", order: "updated_at.desc" }) : [],
      !summaryOnly && canReadProducts ? loadDistributorProductMemory(auth.context.organization.id, [raw]) : { mappingMemories: [], mappingAccessories: [] }
    ]);
    const detailed = summaryOnly ? raw : withEffectiveRequirements(requirementSnapshot(raw));
    const requirement = { ...requirementSnapshot(detailed), can_edit: await callUserRpc<boolean>("can_edit_project_requirement", { rid: requirementId }) };
    return NextResponse.json({ requirement: summaryOnly ? compactProjectRequirement(requirement) : requirement, overviewRequirement: compactProjectRequirement(requirement), assignments, ...memory }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const forbidden = error instanceof UserSupabaseError && (error.status === 401 || error.status === 403 || error.code === "42501");
    console.error("project_requirement_read_failed", { code: error instanceof UserSupabaseError ? error.code : undefined });
    return NextResponse.json({ error: forbidden ? "Du har inte åtkomst till produktposten." : "Produktposten kunde inte laddas. Försök igen." }, { status: forbidden ? 403 : 503 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.requirement.update"]);
    if (authorization.error) return authorization.error;
    const { id, requirementId } = await context.params;
    if (!isUuid(id) || !isUuid(requirementId)) return NextResponse.json({ error: "Ogiltigt krav-id." }, { status: 400 });
    const body = (await request.json().catch(() => null)) as RequirementReviewInput | null;
    const input = validateReview(body);
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

    const requirement = await updateUserRowsReturning("project_requirements", {
      id: `eq.${requirementId}`,
      project_id: `eq.${id}`,
      organization_id: `eq.${authorization.context.organization.id}`
    }, {
      ...input,
      reviewed_by: authorization.user.id,
      reviewed_at: new Date().toISOString()
    });
    return NextResponse.json({ requirement });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json({ error: forbidden ? "Ändringen nekades." : "Produktraden kunde inte uppdateras." }, { status: forbidden ? 403 : 500 });
    }
    return NextResponse.json({ error: "Kravet kunde inte uppdateras." }, { status: 500 });
  }
}

type RequirementReviewInput = {
  status?: unknown;
  valueText?: unknown;
  certainty?: unknown;
  reviewerComment?: unknown;
};

function validateReview(body: RequirementReviewInput | null) {
  if (!body || typeof body !== "object") return { error: "Ingen granskning angavs." } as const;
  const output: Record<string, unknown> = {};
  if ("status" in body) {
    const statuses = [
      "user_confirmed",
      "user_modified",
      "extracted_unreviewed",
      "inferred_unreviewed",
      "conflicted",
      "rejected",
      "superseded"
    ];
    if (typeof body.status !== "string" || !statuses.includes(body.status)) return { error: "Ogiltig kravstatus." } as const;
    output.status = body.status;
  }
  if ("valueText" in body) {
    if (body.valueText !== null && typeof body.valueText !== "string") return { error: "Kravvärdet måste vara text." } as const;
    output.value_text = typeof body.valueText === "string" ? body.valueText.trim().slice(0, 2000) : null;
  }
  if ("certainty" in body) {
    if (body.certainty !== "explicit" && body.certainty !== "interpreted") return { error: "Ogiltig säkerhetstyp." } as const;
    output.certainty = body.certainty;
  }
  if ("reviewerComment" in body) {
    if (body.reviewerComment !== null && typeof body.reviewerComment !== "string") return { error: "Kommentaren måste vara text." } as const;
    output.reviewer_comment = typeof body.reviewerComment === "string" ? body.reviewerComment.trim().slice(0, 3000) : null;
  }
  return Object.keys(output).length > 0 ? output : { error: "Ingen ändring angavs." } as const;
}
