import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase-auth";
import { callUserRpc, selectUserRows, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

type JoinRequestRow = {
  id: string;
  organization_id: string;
  user_id: string;
  message: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  try {
    const requests = await selectUserRows<JoinRequestRow>("organization_join_requests", {
      select: "id,organization_id,user_id,message,status,reviewed_by,reviewed_at,created_at,updated_at",
      user_id: `eq.${user.id}`,
      order: "created_at.desc"
    });
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Join requests could not be loaded." },
      { status: error instanceof UserSupabaseError ? error.status : 500 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { organizationId?: string; message?: string }
    | null;
  const organizationId = body?.organizationId?.trim();
  if (!organizationId || !uuidPattern.test(organizationId)) {
    return NextResponse.json({ error: "A valid organizationId is required." }, { status: 400 });
  }

  try {
    const requestId = await callUserRpc<string>("create_organization_join_request", {
      requested_organization_id: organizationId,
      requested_message: body?.message?.trim() || null
    });
    return NextResponse.json({ requestId, status: "pending" }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Join request could not be created.", detail: error instanceof UserSupabaseError ? error.message : undefined },
      { status: error instanceof UserSupabaseError ? error.status : 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { requestId?: string; decision?: "approved" | "rejected" | "cancelled" }
    | null;
  const requestId = body?.requestId?.trim();
  const decision = body?.decision;
  if (!requestId || !uuidPattern.test(requestId) || !decision) {
    return NextResponse.json({ error: "A valid requestId and decision are required." }, { status: 400 });
  }

  try {
    const functionName = decision === "cancelled"
      ? "cancel_organization_join_request"
      : "review_organization_join_request";
    const result = await callUserRpc<string>(functionName, decision === "cancelled"
      ? { requested_request_id: requestId }
      : { requested_request_id: requestId, requested_decision: decision });
    return NextResponse.json({ requestId: result, status: decision });
  } catch (error) {
    return NextResponse.json(
      { error: "Join request could not be updated.", detail: error instanceof UserSupabaseError ? error.message : undefined },
      { status: error instanceof UserSupabaseError ? error.status : 500 }
    );
  }
}
