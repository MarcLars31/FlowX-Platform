import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi(["project.delete"]);
  if (authorization.error) return authorization.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { reason?: string; confirmation?: string }
    | null;
  if (!isUuid(id) || !body?.reason || !body.confirmation) {
    return NextResponse.json(
      { error: "Project ID, reason and name confirmation are required." },
      { status: 400 }
    );
  }

  try {
    const projectId = await callUserRpc<string>("soft_delete_project", {
      requested_project_id: id,
      requested_reason: body.reason,
      requested_confirmation: body.confirmation
    });
    return NextResponse.json({ projectId });
  } catch (error) {
    return rpcError(error);
  }
}

function isUuid(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

function rpcError(error: unknown) {
  return NextResponse.json(
    {
      error: "The project could not be moved to trash."
    },
    { status: error instanceof UserSupabaseError ? 403 : 500 }
  );
}
