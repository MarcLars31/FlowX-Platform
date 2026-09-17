import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  callUserRpc,
  UserSupabaseError
} from "@/lib/supabase-user-rest";
import { isOrganizationRoleSlug } from "@/lib/organization-rbac";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi(["member.change_role"]);
  if (authorization.error) return authorization.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { role?: string }
    | null;

  if (!isUuid(id) || !body?.role || !isOrganizationRoleSlug(body.role)) {
    return NextResponse.json(
      { error: "A valid member ID and organization role are required." },
      { status: 400 }
    );
  }

  try {
    const memberId = await callUserRpc<string>(
      "change_organization_member_role",
      {
        requested_member_id: id,
        requested_role_slug: body.role
      }
    );
    return NextResponse.json({ memberId });
  } catch (error) {
    return NextResponse.json(
      {
        error: "The member role could not be changed."
      },
      { status: error instanceof UserSupabaseError ? 403 : 500 }
    );
  }
}

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}
