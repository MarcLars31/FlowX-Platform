import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { updateUserRowsReturning, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string; memberId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const authorization = await requireOrganizationApi(["project.manage_members"]);
    if (authorization.error) return authorization.error;
    const { id, memberId } = await context.params;
    if (!isUuid(id) || !isUuid(memberId)) return NextResponse.json({ error: "Ogiltigt projektmedlems-id." }, { status: 400 });
    const body = (await request.json().catch(() => null)) as { projectRole?: unknown } | null;
    if (body?.projectRole !== "editor" && body?.projectRole !== "reviewer" && body?.projectRole !== "viewer") {
      return NextResponse.json({ error: "Välj rollen redaktör eller läsare." }, { status: 400 });
    }
    const member = await updateUserRowsReturning("project_members", {
      organization_member_id: `eq.${memberId}`,
      project_id: `eq.${id}`
    }, { project_role: body.projectRole });
    return NextResponse.json({ member });
  } catch (error) {
    if (error instanceof UserSupabaseError) {
      const forbidden = error.status === 401 || error.status === 403 || error.code === "42501";
      return NextResponse.json({ error: forbidden ? "Projektåtkomsten nekades." : "Medlemmen kunde inte uppdateras." }, { status: forbidden ? 403 : 500 });
    }
    return NextResponse.json({ error: "Medlemmen kunde inte uppdateras." }, { status: 500 });
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
