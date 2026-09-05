import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  deleteUserRows,
  insertUserRowReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi(["team.manage_members"]);
  if (authorization.error) return authorization.error;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { organizationMemberId?: string; teamRole?: string }
    | null;
  if (!isUuid(id) || !body?.organizationMemberId || !isUuid(body.organizationMemberId)) {
    return NextResponse.json({ error: "A valid team and member are required." }, { status: 400 });
  }

  try {
    const teamMember = await insertUserRowReturning("team_members", {
      team_id: id,
      organization_member_id: body.organizationMemberId,
      team_role: body.teamRole?.trim() || null
    });
    return NextResponse.json({ teamMember }, { status: 201 });
  } catch (error) {
    return memberError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi(["team.manage_members"]);
  if (authorization.error) return authorization.error;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { organizationMemberId?: string }
    | null;
  if (!isUuid(id) || !body?.organizationMemberId || !isUuid(body.organizationMemberId)) {
    return NextResponse.json({ error: "A valid team and member are required." }, { status: 400 });
  }

  try {
    await deleteUserRows("team_members", {
      team_id: `eq.${id}`,
      organization_member_id: `eq.${body.organizationMemberId}`
    });
    return NextResponse.json({ teamId: id, organizationMemberId: body.organizationMemberId });
  } catch (error) {
    return memberError(error);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function memberError(error: unknown) {
  return NextResponse.json(
    {
      error: "Team member operation was denied."
    },
    { status: error instanceof UserSupabaseError ? 403 : 500 }
  );
}
