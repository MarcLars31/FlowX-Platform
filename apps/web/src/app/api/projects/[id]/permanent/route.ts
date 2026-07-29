import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi([
    "project.permanent_delete"
  ]);
  if (authorization.error) return authorization.error;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | { confirmation?: string }
    | null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !body?.confirmation) {
    return NextResponse.json(
      { error: "Project ID and name confirmation are required." },
      { status: 400 }
    );
  }

  try {
    const projectId = await callUserRpc<string>(
      "permanently_delete_project",
      {
        requested_project_id: id,
        requested_confirmation: body.confirmation
      }
    );
    return NextResponse.json({ projectId });
  } catch (error) {
    return NextResponse.json(
      {
        error: "The project could not be permanently deleted.",
        detail: error instanceof UserSupabaseError ? error.message : undefined
      },
      { status: error instanceof UserSupabaseError ? 403 : 500 }
    );
  }
}
