import { NextResponse } from "next/server";
import { isUuid } from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  PRODUCT_REQUIREMENT_RESOLUTIONS,
  type ProductRequirementResolutionStatus,
  withProductRequirementResolution
} from "@/lib/product-requirement-resolution";
import {
  callUserRpc,
  selectUserRows,
  updateUserRowsReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type RequirementValueRow = {
  id: string;
  value_json: unknown;
  updated_at: string;
};

const REQUIREMENT_VALUE_UPDATE_ATTEMPTS = 3;

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi([
      "project.product_suggestion.create"
    ]);
    if (authorization.error) return authorization.error;

    const { id: projectId } = await context.params;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const requirementId = body?.requirementId;
    const resolution = body?.resolution;
    if (!isUuid(projectId) || !isUuid(requirementId)) {
      return NextResponse.json({ error: "Ogiltigt projekt- eller krav-id." }, { status: 400 });
    }
    if (
      resolution !== null &&
      (typeof resolution !== "string" || !(resolution in PRODUCT_REQUIREMENT_RESOLUTIONS))
    ) {
      return NextResponse.json({ error: "Ogiltig produktmärkning." }, { status: 400 });
    }

    if (resolution !== null) {
      await callUserRpc<string>("prepare_requirement_for_direct_product_mapping", {
        requested_project_id: projectId,
        requested_requirement_id: requirementId
      });
    }

    const organizationId = authorization.context.organization.id;
    const resolvedAt = new Date().toISOString();
    const updated = await updateRequirementResolutionWithRetry({
      projectId,
      requirementId,
      organizationId,
      resolution: resolution as ProductRequirementResolutionStatus | null,
      resolvedAt,
      resolvedBy: authorization.user.id
    });
    if (!updated) {
      return NextResponse.json({ error: "Produktraden hittades inte." }, { status: 404 });
    }

    if (resolution !== null) {
      const selectedAssignments = await selectUserRows<{ id: string }>(
        "project_product_suggestions",
        {
          select: "id",
          project_id: `eq.${projectId}`,
          requirement_id: `eq.${requirementId}`,
          organization_id: `eq.${organizationId}`,
          status: "eq.selected"
        }
      );
      await Promise.all(selectedAssignments.map((assignment) =>
        updateUserRowsReturning(
          "project_product_suggestions",
          {
            id: `eq.${assignment.id}`,
            project_id: `eq.${projectId}`,
            organization_id: `eq.${organizationId}`
          },
          { status: "rejected" }
        )
      ));
    }

    return NextResponse.json({
      requirement: updated,
      resolution,
      label: resolution === null
        ? null
        : PRODUCT_REQUIREMENT_RESOLUTIONS[resolution as ProductRequirementResolutionStatus],
      message: resolution === null
        ? "Märkningen har tagits bort. Produktraden behöver nu ett produktval."
        : "Produktraden är märkt som Inte i sortiment och blockerar inte projektets godkännande."
    });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const denied = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        { error: denied ? "Du saknar behörighet att märka produktraden." : "Märkningen kunde inte sparas." },
        { status: denied ? 403 : 400 }
      );
    }
    return NextResponse.json({ error: "Märkningen kunde inte sparas." }, { status: 500 });
  }
}

async function updateRequirementResolutionWithRetry({
  projectId,
  requirementId,
  organizationId,
  resolution,
  resolvedAt,
  resolvedBy
}: {
  projectId: string;
  requirementId: string;
  organizationId: string;
  resolution: ProductRequirementResolutionStatus | null;
  resolvedAt: string;
  resolvedBy: string;
}) {
  let lastConflict: unknown;
  for (let attempt = 0; attempt < REQUIREMENT_VALUE_UPDATE_ATTEMPTS; attempt += 1) {
    const [requirement] = await selectUserRows<RequirementValueRow>(
      "project_requirements",
      {
        select: "id,value_json,updated_at",
        id: `eq.${requirementId}`,
        project_id: `eq.${projectId}`,
        organization_id: `eq.${organizationId}`,
        deleted_at: "is.null",
        limit: "1"
      }
    );
    if (!requirement) return null;

    try {
      return await updateUserRowsReturning<RequirementValueRow>(
        "project_requirements",
        {
          id: `eq.${requirementId}`,
          project_id: `eq.${projectId}`,
          organization_id: `eq.${organizationId}`,
          updated_at: `eq.${requirement.updated_at}`,
          deleted_at: "is.null"
        },
        {
          value_json: withProductRequirementResolution(
            requirement.value_json,
            resolution,
            { resolvedAt, resolvedBy }
          )
        }
      );
    } catch (error) {
      if (!isRequirementValueConflict(error)) throw error;
      lastConflict = error;
    }
  }

  throw lastConflict ?? new Error("Product requirement resolution was not saved.");
}

function isRequirementValueConflict(error: unknown) {
  return error instanceof Error &&
    error.message === "Supabase update of project_requirements returned no row.";
}
