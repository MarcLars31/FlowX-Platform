import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  deleteUserRows,
  insertUserRowReturning,
  selectUserRows,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
type ProjectRole = "editor" | "reviewer" | "viewer";

export async function POST(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.manage_members"]);
    if (authorization.error) return authorization.error;
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });

    const body = (await request.json().catch(() => null)) as { organizationMemberId?: unknown; projectRole?: unknown } | null;
    if (typeof body?.organizationMemberId !== "string" || !isUuid(body.organizationMemberId)) {
      return NextResponse.json({ error: "Välj en giltig organisationsmedlem." }, { status: 400 });
    }
    if (!isProjectRole(body.projectRole)) {
      return NextResponse.json({ error: "Välj rollen redaktör eller läsare." }, { status: 400 });
    }

    const organizationId = authorization.context.organization.id;
    const [member] = await selectUserRows<{ id: string }>("organization_members", {
      select: "id",
      id: `eq.${body.organizationMemberId}`,
      organization_id: `eq.${organizationId}`,
      status: "eq.active",
      limit: "1"
    });
    if (!member) return NextResponse.json({ error: "Medlemmen tillhör inte organisationen eller är inte aktiv." }, { status: 400 });

    const projectMember = await insertUserRowReturning<{
      project_id: string;
      organization_member_id: string;
      project_role: ProjectRole;
    }>("project_members", {
      project_id: id,
      organization_member_id: body.organizationMemberId,
      project_role: body.projectRole
    });
    return NextResponse.json({ member: projectMember }, { status: 201 });
  } catch (error) {
    return memberError(error, "Medlemmen kunde inte läggas till.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.manage_members"]);
    if (authorization.error) return authorization.error;
    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });
    const body = (await request.json().catch(() => null)) as { organizationMemberId?: unknown } | null;
    if (typeof body?.organizationMemberId !== "string" || !isUuid(body.organizationMemberId)) {
      return NextResponse.json({ error: "Ogiltigt organisationsmedlems-id." }, { status: 400 });
    }

    const [member] = await selectUserRows<{ organization_member_id: string; project_role: string }>("project_members", {
      select: "organization_member_id,project_role",
      organization_member_id: `eq.${body.organizationMemberId}`,
      project_id: `eq.${id}`,
      limit: "1"
    });
    if (!member) return NextResponse.json({ error: "Projektmedlemmen hittades inte." }, { status: 404 });
    if (member.project_role === "owner") {
      return NextResponse.json({ error: "Projektägaren kan inte tas bort." }, { status: 400 });
    }

    await deleteUserRows("project_members", {
      organization_member_id: `eq.${body.organizationMemberId}`,
      project_id: `eq.${id}`
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return memberError(error, "Medlemmen kunde inte tas bort.");
  }
}

function isProjectRole(value: unknown): value is ProjectRole {
  return value === "editor" || value === "reviewer" || value === "viewer";
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function memberError(error: unknown, fallback: string) {
  if (error instanceof UserSupabaseError) {
    const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
    return NextResponse.json({ error: forbidden ? "Projektåtkomsten nekades." : fallback }, { status: forbidden ? 403 : 500 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
