import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { callUserRpc, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await requireOrganizationApi(["member.invite"]);
  if (authorization.error) return authorization.error;

  const body = (await request.json().catch(() => null)) as
    | { email?: string; role?: string }
    | null;
  const email = body?.email?.trim().toLowerCase();
  const role = body?.role;
  if (!email || !role || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { error: "A valid email and role are required." },
      { status: 400 }
    );
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  try {
    const invitationId = await callUserRpc<string>(
      "create_organization_invitation",
      {
        requested_organization_id: authorization.context.organization.id,
        requested_email: email,
        requested_role_slug: role,
        requested_token_hash: tokenHash,
        requested_expires_at: expiresAt.toISOString()
      }
    );

    // The raw token deliberately remains server-only. Phase 2 connects this
    // point to a transactional email provider and an invitation acceptance UI.
    return NextResponse.json(
      {
        invitationId,
        status: "pending_delivery",
        expiresAt: expiresAt.toISOString()
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invitation could not be created.",
        detail: error instanceof UserSupabaseError ? error.message : undefined
      },
      { status: error instanceof UserSupabaseError ? 403 : 500 }
    );
  }
}
