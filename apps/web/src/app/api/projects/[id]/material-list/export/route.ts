import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  buildProjectMaterialRows,
  createProjectMaterialListWorkbook,
  type MaterialListAssignment,
  type MaterialListProject,
  type MaterialListRequirement
} from "@/lib/project-material-list-export";
import { selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["material_list.export"]);
    if (authorization.error) return authorization.error;
    if (!authorization.context.permissions.includes("project.product_suggestion.view")) {
      return NextResponse.json(
        { error: "Du har inte behörighet att läsa projektets produktval." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    if (!isUuid(id)) {
      return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    }
    const organizationId = authorization.context.organization.id;
    const [project] = await selectUserRows<MaterialListProject>("projects", {
      select: "id,name,project_number,customer_name,end_customer,standard,system_type,supplier,status",
      id: `eq.${id}`,
      organization_id: `eq.${organizationId}`,
      deleted_at: "is.null",
      limit: "1"
    });
    if (!project) {
      return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
    }

    const [requirements, assignments] = await Promise.all([
      selectUserRows<MaterialListRequirement>("project_requirements", {
        select: "id,category,requirement_key,value_text",
        project_id: `eq.${id}`,
        organization_id: `eq.${organizationId}`,
        deleted_at: "is.null",
        limit: "1000"
      }),
      selectUserRows<MaterialListAssignment>("project_product_suggestions", {
        select: "id,requirement_id,product_snapshot,selected_at",
        project_id: `eq.${id}`,
        organization_id: `eq.${organizationId}`,
        status: "eq.selected",
        order: "selected_at.asc.nullslast,created_at.asc",
        limit: "1000"
      })
    ]);
    const rows = buildProjectMaterialRows({ requirements, assignments });
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Projektet har inga registrerade produktval att exportera." },
        { status: 409 }
      );
    }

    const bytes = await createProjectMaterialListWorkbook({
      organizationName: authorization.context.organization.name,
      project,
      rows
    });
    const filename = exportFilename(project);

    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const denied = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json(
        { error: denied ? "Projektåtkomsten nekades." : "Projektdata kunde inte läsas." },
        { status: denied ? 403 : 500 }
      );
    }
    return NextResponse.json(
      { error: "Excel-exporten kunde inte skapas." },
      { status: 500 }
    );
  }
}

function exportFilename(project: MaterialListProject) {
  const projectPart = (project.project_number || project.name || "projekt")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "projekt";
  return `scipx-materiallista-${projectPart}.xlsx`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
