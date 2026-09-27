import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { selectUserRows, updateUserRowsReturning, UserSupabaseError } from "@/lib/supabase-user-rest";
import { isUuid } from "@/lib/distributor-product-mapping";
import { loadDistributorProductMemory } from "@/lib/distributor-product-memory";
import { enrichProjectRequirements } from "@/lib/project-requirement-enrichment";
import { compactProjectRequirement, type OverviewRow } from "@/lib/project-overview";

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
    const [documents, assignments, memory] = await Promise.all([
      !summaryOnly && raw.source_technical_description_document_id && auth.context.permissions.includes("technical_description.view")
        ? selectUserRows<OverviewRow>("technical_description_documents", { ...filters, id: `eq.${raw.source_technical_description_document_id}`, select: "id,file_name,source_pages", limit: "1" }) : [],
      canReadProducts ? selectUserRows<OverviewRow>("project_product_suggestions", { ...filters, requirement_id: `eq.${requirementId}`, status: "eq.selected", order: "updated_at.desc" }) : [],
      !summaryOnly && canReadProducts ? loadDistributorProductMemory(auth.context.organization.id, [raw]) : { mappingMemories: [], mappingAccessories: [] }
    ]);
    const requirement = summaryOnly ? raw : enrichProjectRequirements([raw], documents)[0];
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
