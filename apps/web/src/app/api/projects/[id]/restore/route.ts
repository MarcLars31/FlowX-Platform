import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authorization = await requireOrganizationApi(["project.restore"]);
  if (authorization.error) return authorization.error;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
  }

  try {
    const projectId = await callUserRpc<string>("restore_project", {
      requested_project_id: id
    });
    return NextResponse.json({ projectId });
  } catch (error) {
    return NextResponse.json(
      {
        error: "The project could not be restored.",
        detail: error instanceof UserSupabaseError ? error.message : undefined
      },
      { status: error instanceof UserSupabaseError ? 403 : 500 }
    );
  }
}
