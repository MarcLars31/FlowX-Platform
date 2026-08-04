import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import {
  deleteUserRows,
  updateUserRowsReturning,
  UserSupabaseError
} from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi(["team.update"]);
  if (authorization.error) return authorization.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { name?: string; description?: string; status?: string }
    | null;
  const name = body?.name?.trim();
  const status = body?.status;
  if (!isUuid(id) || !name || name.length > 200) {
    return NextResponse.json({ error: "A valid team name is required." }, { status: 400 });
  }
  if (status && !["active", "inactive"].includes(status)) {
    return NextResponse.json({ error: "Invalid team status." }, { status: 400 });
  }

  try {
    const team = await updateUserRowsReturning("teams", {
      id: `eq.${id}`,
      organization_id: `eq.${authorization.context.organization.id}`
    }, {
      name,
      description: optionalText(body?.description, 2000),
      ...(status ? { status } : {})
    });
    return NextResponse.json({ team });
  } catch (error) {
    return teamError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi(["team.delete"]);
  if (authorization.error) return authorization.error;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid team ID." }, { status: 400 });

  try {
    await deleteUserRows("teams", {
      id: `eq.${id}`,
      organization_id: `eq.${authorization.context.organization.id}`
    });
    return NextResponse.json({ teamId: id });
  } catch (error) {
    return teamError(error);
  }
}

function optionalText(value: string | undefined, maxLength: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function teamError(error: unknown) {
  return NextResponse.json(
    {
      error: "Team operation was denied.",
      detail: error instanceof UserSupabaseError ? error.message : undefined
    },
    { status: error instanceof UserSupabaseError ? 403 : 500 }
  );
}
