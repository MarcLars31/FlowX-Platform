import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

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
