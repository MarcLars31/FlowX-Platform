import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  callUserRpc,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

const allowedStatuses = ["active", "suspended", "disabled"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi(["member.disable"]);
  if (authorization.error) return authorization.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { status?: string }
    | null;

  if (
    !isUuid(id) ||
    !body?.status ||
    !allowedStatuses.includes(body.status as (typeof allowedStatuses)[number])
  ) {
    return NextResponse.json(
      { error: "A valid member ID and membership status are required." },
      { status: 400 }
    );
  }

  try {
    const memberId = await callUserRpc<string>(
      "set_organization_member_status",
      {
        requested_member_id: id,
        requested_status: body.status
      }
    );
    return NextResponse.json({ memberId });
  } catch (error) {
    return NextResponse.json(
      {
        error: "The member status could not be changed.",
        detail: error instanceof UserSupabaseError ? error.message : undefined
      },
      { status: error instanceof UserSupabaseError ? 403 : 500 }
    );
  }
}

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}
