import { NextResponse } from "next/server";
import {
  callAuthRpcWithAccessToken,
  getAuthUserWithAccessToken,
  updateAuthUserPassword
} from "@/lib/supabase-auth-invitations";
import { saveAuthSession, signInWithPassword } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        invitationId?: string;
        accessToken?: string;
        password?: string;
        passwordConfirmation?: string;
      }
    | null;
  const invitationId = body?.invitationId?.trim();
  const accessToken = body?.accessToken?.trim();
  const password = body?.password ?? "";

  if (!invitationId || !uuidPattern.test(invitationId) || !accessToken) {
    return NextResponse.json(
      { error: "Inbjudningslänken är ogiltig eller ofullständig." },
      { status: 400 }
    );
  }

  if (password.length < 8 || password !== body?.passwordConfirmation) {
    return NextResponse.json(
      { error: "Lösenorden måste vara lika och innehålla minst 8 tecken." },
      { status: 400 }
    );
  }

  try {
    const authUser = await getAuthUserWithAccessToken(accessToken);
    if (!authUser.email) {
      return NextResponse.json(
        { error: "Det inbjudna kontot saknar e-postadress." },
        { status: 400 }
      );
    }

    await updateAuthUserPassword(accessToken, password);
    await callAuthRpcWithAccessToken(
      accessToken,
      "accept_organization_invitation",
      { requested_invitation_id: invitationId }
    );

    const session = await signInWithPassword(authUser.email, password);
    await saveAuthSession(session);

    return NextResponse.json({ redirectTo: "/dashboard" });
  } catch {
    return NextResponse.json(
      { error: "Inbjudan kunde inte aktiveras. Kontrollera länken och försök igen." },
      { status: 400 }
    );
  }
}
