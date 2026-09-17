import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  selectUserRows,
  updateUserRowsReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type AccessLevel = OrganizationProject["access_level"];

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.manage_members"]);
    if (authorization.error) return authorization.error;

    const { id } = await context.params;
    if (!isUuid(id)) return NextResponse.json({ error: "Ogiltigt projekt-id." }, { status: 400 });

    const body = (await request.json().catch(() => null)) as {
      accessLevel?: unknown;
      teamId?: unknown;
    } | null;
    const accessLevel = body?.accessLevel;
    if (!isAccessLevel(accessLevel)) {
      return NextResponse.json({ error: "Ogiltig projektåtkomst." }, { status: 400 });
    }

    const teamId = body?.teamId === null || body?.teamId === "" || typeof body?.teamId === "undefined"
      ? null
      : typeof body?.teamId === "string" && isUuid(body.teamId)
        ? body.teamId
        : undefined;
    if (teamId === undefined) {
      return NextResponse.json({ error: "Ogiltigt team-id." }, { status: 400 });
    }
    if (accessLevel === "team" && !teamId) {
      return NextResponse.json({ error: "Välj ett team för teamåtkomst." }, { status: 400 });
    }

    const organizationId = authorization.context.organization.id;
    if (teamId) {
      const [team] = await selectUserRows<{ id: string }>("teams", {
        select: "id",
        id: `eq.${teamId}`,
        organization_id: `eq.${organizationId}`,
        status: "eq.active",
        limit: "1"
      });
      if (!team) return NextResponse.json({ error: "Teamet tillhör inte organisationen." }, { status: 400 });
    }

    const project = await updateUserRowsReturning<OrganizationProject>(
      "projects",
      { id: `eq.${id}`, organization_id: `eq.${organizationId}`, deleted_at: "is.null" },
      { access_level: accessLevel, team_id: accessLevel === "team" ? teamId : null }
    );
    return NextResponse.json({ project });
  } catch (error) {
    return accessError(error);
  }
}

function isAccessLevel(value: unknown): value is AccessLevel {
  return value === "own" || value === "team" || value === "organization" || value === "restricted";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function accessError(error: unknown) {
  if (error instanceof UserSupabaseError) {
    const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
    return NextResponse.json(
      { error: forbidden ? "Projektåtkomsten nekades." : "Projektåtkomsten kunde inte sparas." },
      { status: forbidden ? 403 : 500 }
    );
  }
  return NextResponse.json({ error: "Projektåtkomsten kunde inte sparas." }, { status: 500 });
}
