import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationApi } from "@/lib/organization-api-authorization";
import { inviteUserByEmail } from "@/lib/supabase-auth-invitations";
import { callUserRpc, UserSupabaseError } from "@/lib/supabase-user-rest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await requireOrganizationApi(["member.invite"]);
  if (authorization.error) return authorization.error;

  const body = (await request.json().catch(() => null)) as
    | { email?: string; role?: string; firstName?: string; lastName?: string }
    | null;
  const email = body?.email?.trim().toLowerCase();
  const role = body?.role;
  const firstName = body?.firstName?.trim();
  const lastName = body?.lastName?.trim();
  if (
    !email ||
    !role ||
    !firstName ||
    !lastName ||
    firstName.length > 100 ||
    lastName.length > 100 ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  ) {
    return NextResponse.json(
      { error: "Förnamn, efternamn, giltig e-post och roll krävs." },
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

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.SITE_URL ??
      new URL(request.url).origin;
    const redirectUrl = new URL("/acceptera-inbjudan", siteUrl);
    redirectUrl.searchParams.set("invitation", invitationId);

    try {
      await inviteUserByEmail(email, redirectUrl.toString(), {
        flowx_invitation_id: invitationId,
        first_name: firstName,
        last_name: lastName
      });
    } catch (inviteError) {
      await callUserRpc("revoke_organization_invitation", {
        requested_invitation_id: invitationId
      }).catch(() => undefined);

      const configurationError =
        inviteError instanceof Error &&
        inviteError.message.includes("SUPABASE_SECRET_KEY");
      return NextResponse.json(
        {
          error: configurationError
            ? "Inbjudningsmejl är inte konfigurerat på servern."
            : "Inbjudningsmejlet kunde inte skickas. Försök igen."
        },
        { status: configurationError ? 503 : 502 }
      );
    }

    return NextResponse.json(
      {
        invitationId,
        status: "sent",
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
