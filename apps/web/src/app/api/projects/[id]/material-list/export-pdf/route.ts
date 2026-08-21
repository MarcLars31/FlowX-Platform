import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { loadProjectMaterialListData } from "@/lib/project-material-list-data";
import { createProjectMaterialListPdf } from "@/lib/project-material-list-pdf";
import type { MaterialListProject } from "@/lib/project-material-list-export";
import { UserSupabaseError } from "@/lib/supabase-user-rest";

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

    const materialList = await loadProjectMaterialListData(
      id,
      authorization.context.organization.id
    );
    if (!materialList) {
      return NextResponse.json({ error: "Projektet hittades inte." }, { status: 404 });
    }
    if (materialList.rows.length === 0) {
      return NextResponse.json(
        { error: "Projektet har inga poster att exportera." },
        { status: 409 }
      );
    }

    const bytes = await createProjectMaterialListPdf({
      organizationName: authorization.context.organization.name,
      project: materialList.project,
      rows: materialList.rows
    });

    return new Response(bytes.slice().buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${exportFilename(materialList.project)}"`,
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
      { error: "PDF-exporten kunde inte skapas." },
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
  return `scipx-projektsammanfattning-${projectPart}.pdf`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
