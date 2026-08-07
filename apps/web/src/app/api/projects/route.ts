import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  callUserRpc,
  selectUserRows,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import type {
  OrganizationProject
} from "@/types/organization";
import type { ProjectAccessLevel } from "@/lib/organization-rbac";
import { DEMO_DATA_DISCLAIMER } from "@/lib/demo-data";

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
        "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,address,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,current_stage,access_level,created_by,assigned_to,project_manager_id,estimator_id,expected_start_date,expected_delivery_date,internal_comments,technical_parameters,demo_data_set_id,created_at,updated_at",
      organization_id: `eq.${authorization.context.organization.id}`,
      deleted_at: "is.null",
      order: "updated_at.desc"
    });

    return NextResponse.json({
      projects,
      demoDataDisclaimer: projects.some((project) => project.demo_data_set_id)
        ? DEMO_DATA_DISCLAIMER
        : null
    });
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
    const catalogError = await validateCatalogSelections(
      input.manufacturer,
      input.distributor
    );
    if (catalogError) {
      return NextResponse.json({ error: catalogError }, { status: 400 });
    }

    const rpcResult = await callUserRpc<unknown>("create_project_with_details", {
      requested_organization_id: authorization.context.organization.id,
      requested_project_number: input.projectNumber,
      requested_name: input.name,
      requested_description: input.description,
      requested_customer_name: input.customerName,
      requested_project_type: input.projectType,
      requested_country_code: input.country,
      requested_language_code: "sv",
      requested_currency_code: input.currency,
      requested_owner_user_id: authorization.user.id,
      requested_module_code: "sprinkler",
      requested_standard: input.standard,
      requested_system_type: input.systemType,
      requested_supplier: input.manufacturer,
      requested_delivery_country: input.deliveryCountry,
      requested_access_level: input.accessLevel,
      requested_team_id: input.teamId,
      requested_details: {
        end_customer: input.endCustomer,
        address: input.address,
        procurement_strategy: input.procurementStrategy,
        warehouse_location: input.warehouseLocation,
        expected_start_date: input.expectedStartDate,
        expected_delivery_date: input.expectedDeliveryDate,
        internal_comments: input.internalComments,
        technical_parameters: input.technicalParameters,
        preferred_distributor: input.distributor
      }
    });
    const projectId =
      typeof rpcResult === "string"
        ? rpcResult
        : isRecord(rpcResult) && typeof rpcResult.id === "string"
          ? rpcResult.id
          : null;
    if (!projectId) throw new Error("Supabase returned no new project id.");

    const [project] = await selectUserRows<OrganizationProject>("projects", {
      select:
        "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,address,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,current_stage,access_level,created_by,assigned_to,project_manager_id,estimator_id,expected_start_date,expected_delivery_date,internal_comments,technical_parameters,demo_data_set_id,created_at,updated_at",
      id: `eq.${projectId}`,
      organization_id: `eq.${authorization.context.organization.id}`,
      limit: "1"
    });
    if (!project) throw new Error("The new project could not be loaded.");

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
  manufacturer?: string;
  distributor?: string;
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
      customerName: string;
      endCustomer: string | null;
      address: string | null;
      country: string;
      standard: string;
      systemType: string;
      manufacturer: string | null;
      distributor: string | null;
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

  const customerName = requiredText(body?.customerName, 200);
  const country = requiredText(body?.country, 100);
  const standard = requiredText(body?.standard, 100);
  const systemType = requiredText(body?.systemType, 150);
  if (!customerName || !country || !standard || !systemType) {
    return {
      error: [customerName, country, standard, systemType].some((value) => value === null)
        ? "Customer, country, standard and system type are required."
        : "Required project fields are invalid."
    };
  }

  return {
    name,
    projectNumber: optionalText(body?.projectNumber, 100),
    description: optionalText(body?.description, 2000),
    customerName,
    endCustomer: optionalText(body?.endCustomer, 200),
    address: optionalText(body?.address, 300),
    country,
    standard,
    systemType,
    manufacturer: optionalText(body?.manufacturer ?? body?.supplier, 150),
    distributor: optionalText(body?.distributor, 150),
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

function requiredText(value: string | undefined, maxLength: number) {
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

async function validateCatalogSelections(
  manufacturer: string | null,
  distributor: string | null
) {
  if (manufacturer) {
    const matches = await selectUserRows<{ id: string }>("manufacturers", {
      select: "id",
      name: `eq.${manufacturer}`,
      is_active: "eq.true",
      data_set_id: "not.is.null",
      limit: "1"
    });
    if (!matches[0]) return "Välj en tillverkare från demodatabasen.";
  }
  if (distributor) {
    const matches = await selectUserRows<{ id: string }>("suppliers", {
      select: "id",
      name: `eq.${distributor}`,
      supplier_type: "eq.distributor",
      is_active: "eq.true",
      data_set_id: "not.is.null",
      limit: "1"
    });
    if (!matches[0]) return "Välj en distributör från demodatabasen.";
  }
  return null;
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
      },
      { status: forbidden ? 403 : 500 }
    );
  }

  return NextResponse.json(
    {
      error: "The project operation failed.",
    },
    { status: 500 }
  );
}
