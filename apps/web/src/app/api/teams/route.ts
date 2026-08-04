import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  insertUserRowReturning,
  selectUserRows,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type TeamOption = { id: string; name: string };

export async function GET() {
  try {
    const authorization = await requireOrganizationApi(["project.create"]);
    if (authorization.error) return authorization.error;

    const teams = await selectUserRows<TeamOption>("teams", {
      select: "id,name",
      organization_id: `eq.${authorization.context.organization.id}`,
      status: "eq.active",
      order: "name.asc"
    });
    return NextResponse.json({ teams });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Teams could not be loaded.",
        detail: error instanceof UserSupabaseError ? error.message : undefined
      },
      { status: error instanceof UserSupabaseError ? 403 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await requireOrganizationApi(["team.create"]);
    if (authorization.error) return authorization.error;
    const body = (await request.json().catch(() => null)) as
      | { name?: string; description?: string }
      | null;
    const name = body?.name?.trim();
    if (!name || name.length > 200) {
      return NextResponse.json({ error: "A valid team name is required." }, { status: 400 });
    }

    const team = await insertUserRowReturning<TeamOption & { description: string | null }>(
      "teams",
      {
        organization_id: authorization.context.organization.id,
        name,
        description: body?.description?.trim() || null,
        created_by: authorization.user.id,
        status: "active"
      }
    );
    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Team could not be created.",
        detail: error instanceof UserSupabaseError ? error.message : undefined
      },
      { status: error instanceof UserSupabaseError ? 403 : 500 }
    );
  }
}
