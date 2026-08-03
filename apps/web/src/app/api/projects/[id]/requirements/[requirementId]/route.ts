import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { updateUserRowsReturning, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; requirementId: string }> };

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
      return NextResponse.json({ error: forbidden ? "Kravgranskningen nekades." : "Kravet kunde inte uppdateras.", detail: error.message }, { status: forbidden ? 403 : 500 });
    }
    return NextResponse.json({ error: "Kravet kunde inte uppdateras.", detail: error instanceof Error ? error.message : "Okänt fel." }, { status: 500 });
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
    const statuses = ["pending", "confirmed", "rejected", "unclear", "conflict"];
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
