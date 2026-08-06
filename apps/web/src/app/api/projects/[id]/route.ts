import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  selectUserRows,
  updateUserRowsReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";
import { DEMO_DATA_DISCLAIMER } from "@/lib/demo-data";

export const runtime = "nodejs";

const PROJECT_READ_PERMISSIONS = [
  "project.view_own",
  "project.view_team",
  "project.view_organization",
  "project.view_all"
] as const;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(PROJECT_READ_PERMISSIONS);
    if (authorization.error) return authorization.error;
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });

    const [project] = await selectUserRows<OrganizationProject>("projects", {
      select:
        "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,current_stage,access_level,created_by,assigned_to,project_manager_id,estimator_id,expected_start_date,expected_delivery_date,internal_comments,technical_parameters,demo_data_set_id,created_at,updated_at",
      id: `eq.${id}`,
      organization_id: `eq.${authorization.context.organization.id}`,
      deleted_at: "is.null",
      limit: "1"
    });

    if (!project) return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });

    const organizationId = authorization.context.organization.id;
    const [systemTypes, standards, suppliers, requirements, conflicts, suggestions, decisions, versions] =
      await Promise.all([
        selectUserRows("project_system_types", { project_id: `eq.${id}`, organization_id: `eq.${organizationId}`, order: "is_primary.desc,created_at.asc" }),
        selectUserRows("project_standards", { project_id: `eq.${id}`, organization_id: `eq.${organizationId}`, order: "priority.asc,created_at.asc" }),
        selectUserRows("project_supplier_options", { project_id: `eq.${id}`, organization_id: `eq.${organizationId}`, order: "supplier_kind.asc,selection_role.asc" }),
        selectUserRows("project_requirements", { project_id: `eq.${id}`, organization_id: `eq.${organizationId}`, order: "updated_at.desc" }),
        selectUserRows("project_requirement_conflicts", { project_id: `eq.${id}`, organization_id: `eq.${organizationId}`, order: "updated_at.desc" }),
        selectUserRows("project_product_suggestions", { project_id: `eq.${id}`, organization_id: `eq.${organizationId}`, order: "match_score.desc" }),
        selectUserRows("project_decisions", { project_id: `eq.${id}`, organization_id: `eq.${organizationId}`, order: "updated_at.desc" }),
        selectUserRows("project_versions", { project_id: `eq.${id}`, organization_id: `eq.${organizationId}`, order: "version_number.desc" })
      ]);

    const documents = authorization.context.permissions.includes("document.view")
      ? await selectUserRows("project_documents", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          status: "eq.active",
          order: "created_at.desc"
        })
      : [];
    const technicalDescriptions = authorization.context.permissions.includes(
      "technical_description.view"
    )
      ? await selectUserRows("technical_description_documents", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          order: "created_at.desc"
        })
      : [];

    return NextResponse.json({
      project,
      systemTypes,
      standards,
      suppliers,
      documents,
      technicalDescriptions,
      requirements,
      conflicts,
      suggestions,
      decisions,
      versions,
      demoDataDisclaimer: project.demo_data_set_id
        ? DEMO_DATA_DISCLAIMER
        : null
    });
  } catch (error) {
    return projectDetailError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.update"]);
    if (authorization.error) return authorization.error;
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });

    const body = (await request.json().catch(() => null)) as ProjectUpdate | null;
    const input = validateProjectUpdate(body);
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });

    const project = await updateUserRowsReturning<OrganizationProject>(
      "projects",
      {
        id: `eq.${id}`,
        organization_id: `eq.${authorization.context.organization.id}`,
        deleted_at: "is.null"
      },
      input
    );
    return NextResponse.json({ project });
  } catch (error) {
    return projectDetailError(error);
  }
}

type ProjectUpdate = Partial<{
  name: unknown;
  projectNumber: unknown;
  description: unknown;
  customerName: unknown;
  endCustomer: unknown;
  address: unknown;
  country: unknown;
  standard: unknown;
  systemType: unknown;
  supplier: unknown;
  projectType: unknown;
  procurementStrategy: unknown;
  currency: unknown;
  deliveryCountry: unknown;
  warehouseLocation: unknown;
  expectedStartDate: unknown;
  expectedDeliveryDate: unknown;
  internalComments: unknown;
  status: unknown;
  currentStage: unknown;
  technicalParameters: unknown;
}>;

function validateProjectUpdate(body: ProjectUpdate | null) {
  if (!body || typeof body !== "object") return { error: "Projektdata saknas." } as const;
  const output: Record<string, unknown> = {};
  const textFields: Array<[keyof ProjectUpdate, string, number, string]> = [
    ["name", "name", 200, "Projektnamn"],
    ["projectNumber", "project_number", 100, "Projektnummer"],
    ["description", "description", 2000, "Beskrivning"],
    ["customerName", "customer_name", 200, "Kund"],
    ["endCustomer", "end_customer", 200, "Slutkund"],
    ["address", "address", 300, "Adress"],
    ["country", "country", 100, "Land"],
    ["standard", "standard", 100, "Standard"],
    ["systemType", "system_type", 150, "Systemtyp"],
    ["supplier", "supplier", 150, "Leverantör"],
    ["projectType", "project_type", 100, "Projekttyp"],
    ["procurementStrategy", "procurement_strategy", 100, "Inköpsstrategi"],
    ["currency", "currency", 10, "Valuta"],
    ["deliveryCountry", "delivery_country", 100, "Leveransland"],
    ["warehouseLocation", "warehouse_location", 150, "Lagerplats"],
    ["internalComments", "internal_comments", 5000, "Intern kommentar"]
  ];

  for (const [inputKey, outputKey, maxLength, label] of textFields) {
    if (!(inputKey in body)) continue;
    const value = body[inputKey];
    if (typeof value !== "string") return { error: `${label} måste vara text.` } as const;
    const trimmed = value.trim();
    if (inputKey === "name" && !trimmed) return { error: "Projektnamn krävs." } as const;
    output[outputKey] = trimmed ? trimmed.slice(0, maxLength) : null;
  }

  if ("status" in body) {
    const status = typeof body.status === "string" ? body.status : "";
    const allowed = ["draft", "analysis", "awaiting_input", "proposal_ready", "in_review", "approved", "quoted", "ordered", "delivered", "archived", "active"];
    if (!allowed.includes(status)) return { error: "Ogiltig projektstatus." } as const;
    output.status = status;
  }
  if ("currentStage" in body) {
    const currentStage = typeof body.currentStage === "string" ? body.currentStage : "";
    const allowedStages = [
      "setup",
      "documents",
      "technical_description",
      "requirements_review",
      "analysis",
      "product_matching",
      "material_list",
      "approval",
      "completed"
    ];
    if (!allowedStages.includes(currentStage)) return { error: "Ogiltigt arbetssteg." } as const;
    output.current_stage = currentStage;
  }
  for (const [key, column] of [["expectedStartDate", "expected_start_date"], ["expectedDeliveryDate", "expected_delivery_date"]] as const) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value !== null && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
      return { error: "Datum måste anges som YYYY-MM-DD." } as const;
    }
    output[column] = value || null;
  }
  if ("technicalParameters" in body) {
    if (!isRecord(body.technicalParameters)) return { error: "Tekniska parametrar måste vara ett objekt." } as const;
    output.technical_parameters = body.technicalParameters;
  }

  return Object.keys(output).length > 0 ? output : { error: "Ingen ändring angavs." } as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function projectDetailError(error: unknown) {
  if (error instanceof UserSupabaseError) {
    const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
    return NextResponse.json(
      { error: forbidden ? "Projektåtkomsten nekades." : "Projektet kunde inte läsas eller uppdateras." },
      { status: forbidden ? 403 : 500 }
    );
  }
  return NextResponse.json(
    { error: "Projektet kunde inte läsas eller uppdateras." },
    { status: 500 }
  );
}
