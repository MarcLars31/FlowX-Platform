import { NextResponse } from "next/server";
import {
  isUuid,
  validateDistributorProductMapping
} from "@/lib/distributor-product-mapping";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  selectSupabaseRows,
  updateSupabaseRowsReturning
} from "@/lib/supabase-rest";
import { withProductRequirementResolution } from "@/lib/product-requirement-resolution";
import {
  callUserRpc,
  selectUserRows,
  updateUserRowsReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

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
    const validation = validateDistributorProductMapping(
      await request.json().catch(() => null)
    );
    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const input = validation.data;
    await callUserRpc<string>(
      "prepare_requirement_for_direct_product_mapping",
      {
        requested_project_id: id,
        requested_requirement_id: input.requirementId
      }
    );
    const result = await saveExplicitlyApprovedMapping(
      id,
      authorization.user.id,
      input
    );
    await clearRequirementResolution(
      id,
      input.requirementId,
      authorization.context.organization.id,
      authorization.user.id
    );

    return NextResponse.json({
      mapping: result,
      message:
        "Produkten är godkänd och sparad. Kopplingen kan nu föreslås i kommande liknande projekt."
    });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const denied =
        error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        {
          error: denied
            ? "Du har inte behörighet att registrera produktval i projektet."
            : readableDatabaseError(error.message)
        },
        { status: denied ? 403 : 400 }
      );
    }
    return NextResponse.json(
      { error: "Produktvalet kunde inte sparas." },
      { status: 500 }
    );
  }
}

async function clearRequirementResolution(
  projectId: string,
  requirementId: string,
  organizationId: string,
  actorId: string
) {
  const [requirement] = await selectUserRows<{ value_json: unknown }>(
    "project_requirements",
    {
      select: "value_json",
      id: `eq.${requirementId}`,
      project_id: `eq.${projectId}`,
      organization_id: `eq.${organizationId}`,
      deleted_at: "is.null",
      limit: "1"
    }
  );
  if (!requirement) return;
  const valueJson = record(requirement.value_json);
  if (!("productResolution" in valueJson)) return;
  await updateUserRowsReturning(
    "project_requirements",
    {
      id: `eq.${requirementId}`,
      project_id: `eq.${projectId}`,
      organization_id: `eq.${organizationId}`
    },
    {
      value_json: withProductRequirementResolution(valueJson, null, {
        resolvedAt: new Date().toISOString(),
        resolvedBy: actorId
      })
    }
  );
}

async function saveExplicitlyApprovedMapping(
  projectId: string,
  actorId: string,
  input: {
    requirementId: string;
    userApproved: true;
    productName: string;
    productNumber: string;
    manufacturerName: string;
    notes: string;
    accessories: unknown[];
  }
) {
  const mappingPayload = {
    requested_project_id: projectId,
    requested_requirement_id: input.requirementId,
    requested_product_name: input.productName,
    requested_product_number: input.productNumber,
    requested_manufacturer_name: input.manufacturerName || null,
    requested_notes: input.notes || null,
    requested_accessories: input.accessories
  };

  try {
    return await callUserRpc<Record<string, unknown>>(
      "approve_distributor_product_mapping",
      {
        ...mappingPayload,
        requested_user_approved: input.userApproved
      }
    );
  } catch (error) {
    if (!isMissingApprovalRpc(error)) throw error;
  }

  // Deployment-safe fallback while the new migration reaches Supabase. The
  // legacy RPC still performs all project access checks. Its result is stamped
  // server-side before the application can regard the product as approved.
  const result = await callUserRpc<Record<string, unknown>>(
    "save_distributor_product_mapping",
    mappingPayload
  );
  const assignmentId = result.assignmentId;
  if (!isUuid(assignmentId)) {
    throw new Error("The approved assignment id was not returned.");
  }

  const [assignment] = await selectSupabaseRows<{
    product_snapshot: unknown;
  }>("project_product_suggestions", {
    id: `eq.${assignmentId}`,
    project_id: `eq.${projectId}`,
    requirement_id: `eq.${input.requirementId}`,
    selected_by: `eq.${actorId}`,
    status: "eq.selected",
    limit: "1"
  });
  if (!assignment) throw new Error("The approved product assignment was not found.");

  const approvedAt = new Date().toISOString();
  const updatedRows = await updateSupabaseRowsReturning(
    "project_product_suggestions",
    {
      id: `eq.${assignmentId}`,
      project_id: `eq.${projectId}`,
      requirement_id: `eq.${input.requirementId}`,
      selected_by: `eq.${actorId}`,
      status: "eq.selected"
    },
    {
      product_snapshot: {
        ...record(assignment.product_snapshot),
        approvedByUser: true,
        approvalStatus: "user_approved",
        approvedBy: actorId,
        approvedAt
      }
    }
  );
  if (updatedRows.length !== 1) {
    throw new Error("The approved product assignment could not be marked approved.");
  }

  return {
    ...result,
    approvedByUser: true,
    approvalStatus: "user_approved",
    approvedAt
  };
}

function isMissingApprovalRpc(error: unknown) {
  return error instanceof UserSupabaseError &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      error.message.includes("approve_distributor_product_mapping"));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readableDatabaseError(message: string) {
  if (message.includes("Rejected requirements")) {
    return "En avvisad produktrad kan inte kopplas till en produkt.";
  }
  if (message.includes("Only confirmed requirements")) {
    return "Produktraden kunde inte förberedas för produktval.";
  }
  if (message.includes("Removal lines")) {
    return "En demonteringsrad ska inte kopplas till en ny produkt.";
  }
  if (message.includes("Product name and product number")) {
    return "NRF-nummer krävs.";
  }
  return "Produktvalet kunde inte sparas. Kontrollera uppgifterna och försök igen.";
}
