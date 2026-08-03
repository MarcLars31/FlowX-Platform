import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  insertUserRowReturning,
  selectUserRows,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import type {
  OrganizationProject
} from "@/types/organization";
import type { ProjectAccessLevel } from "@/lib/organization-rbac";

export const runtime = "nodejs";

const PROJECT_READ_PERMISSIONS = [
  "project.view_own",
  "project.view_team",
  "project.view_organization",
  "project.view_all"
] as const;

export async function GET() {
  try {
    const authorization = await requireOrganizationApi(
      PROJECT_READ_PERMISSIONS
    );
    if (authorization.error) return authorization.error;

    const projects = await selectUserRows<OrganizationProject>("projects", {
      select:
        "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,access_level,created_by,assigned_to,project_manager_id,estimator_id,expected_start_date,expected_delivery_date,internal_comments,technical_parameters,created_at,updated_at",
      organization_id: `eq.${authorization.context.organization.id}`,
      deleted_at: "is.null",
      order: "updated_at.desc"
    });

    return NextResponse.json({ projects });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireOrganizationApi(["project.create"]);
    if (authorization.error) return authorization.error;

    const body = (await request.json().catch(() => null)) as ProjectInput | null;
    const input = validateProjectInput(body);
    if ("error" in input) {
      return NextResponse.json({ error: input.error }, { status: 400 });
    }

    const project = await insertUserRowReturning<OrganizationProject>(
      "projects",
      {
        organization_id: authorization.context.organization.id,
        owner_id: authorization.user.id,
        created_by: authorization.user.id,
        assigned_to: authorization.user.id,
        name: input.name,
        project_number: input.projectNumber,
        description: input.description,
        customer: input.customerName,
        customer_name: input.customerName,
        end_customer: input.endCustomer,
        address: input.address,
        country: input.country,
        standard: input.standard,
        system_type: input.systemType,
        supplier: input.supplier,
        project_type: input.projectType,
        procurement_strategy: input.procurementStrategy,
        currency: input.currency,
        delivery_country: input.deliveryCountry,
        warehouse_location: input.warehouseLocation,
        expected_start_date: input.expectedStartDate,
        expected_delivery_date: input.expectedDeliveryDate,
        internal_comments: input.internalComments,
        technical_parameters: input.technicalParameters,
        team_id: input.teamId,
        access_level: input.accessLevel,
        status: "draft",
        progress: 0
      }
    );

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return projectErrorResponse(error);
  }
}

type ProjectInput = {
  name?: string;
  projectNumber?: string;
  description?: string;
  customerName?: string;
  endCustomer?: string;
  address?: string;
  country?: string;
  standard?: string;
  systemType?: string;
  supplier?: string;
  projectType?: string;
  procurementStrategy?: string;
  currency?: string;
  deliveryCountry?: string;
  warehouseLocation?: string;
  expectedStartDate?: string;
  expectedDeliveryDate?: string;
  internalComments?: string;
  technicalParameters?: Record<string, unknown>;
  teamId?: string | null;
  accessLevel?: string;
};

function validateProjectInput(body: ProjectInput | null):
  | {
      name: string;
      projectNumber: string | null;
      description: string | null;
      customerName: string | null;
      endCustomer: string | null;
      address: string | null;
      country: string | null;
      standard: string | null;
      systemType: string | null;
      supplier: string | null;
      projectType: string | null;
      procurementStrategy: string | null;
      currency: string | null;
      deliveryCountry: string | null;
      warehouseLocation: string | null;
      expectedStartDate: string | null;
      expectedDeliveryDate: string | null;
      internalComments: string | null;
      technicalParameters: Record<string, unknown>;
      teamId: string | null;
      accessLevel: ProjectAccessLevel;
    }
  | { error: string } {
  const name = body?.name?.trim();
  if (!name || name.length > 200) {
    return { error: "Project name must contain 1–200 characters." };
  }

  const accessLevel = body?.accessLevel ?? "own";
  if (!["own", "team", "organization", "restricted"].includes(accessLevel)) {
    return { error: "Invalid project access level." };
  }
  if (accessLevel === "team" && !body?.teamId) {
    return { error: "Team access requires a team." };
  }
  if (body?.teamId && !isUuid(body.teamId)) {
    return { error: "Invalid team ID." };
  }

  return {
    name,
    projectNumber: optionalText(body?.projectNumber, 100),
    description: optionalText(body?.description, 2000),
    customerName: optionalText(body?.customerName, 200),
    endCustomer: optionalText(body?.endCustomer, 200),
    address: optionalText(body?.address, 300),
    country: optionalText(body?.country, 100),
    standard: optionalText(body?.standard, 100),
    systemType: optionalText(body?.systemType, 150),
    supplier: optionalText(body?.supplier, 150),
    projectType: optionalText(body?.projectType, 100),
    procurementStrategy: optionalText(body?.procurementStrategy, 100),
    currency: optionalText(body?.currency, 10),
    deliveryCountry: optionalText(body?.deliveryCountry, 100),
    warehouseLocation: optionalText(body?.warehouseLocation, 150),
    expectedStartDate: optionalDate(body?.expectedStartDate),
    expectedDeliveryDate: optionalDate(body?.expectedDeliveryDate),
    internalComments: optionalText(body?.internalComments, 5000),
    technicalParameters: isRecord(body?.technicalParameters)
      ? body.technicalParameters
      : {},
    teamId: body?.teamId ?? null,
    accessLevel: accessLevel as ProjectAccessLevel
  };
}

function optionalText(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function optionalDate(value: string | undefined) {
  if (!value?.trim()) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function projectErrorResponse(error: unknown) {
  if (error instanceof UserSupabaseError) {
    const forbidden =
      error.status === 401 ||
      error.status === 403 ||
      error.code === "42501";
    return NextResponse.json(
      {
        error: forbidden
          ? "The project operation was denied."
          : "The project could not be saved.",
        detail: error.message
      },
      { status: forbidden ? 403 : 500 }
    );
  }

  return NextResponse.json(
    {
      error: "The project operation failed.",
      detail: error instanceof Error ? error.message : "Unknown error."
    },
    { status: 500 }
  );
}
