import { NextResponse } from "next/server";
import {
  saveAuthSession,
  signInWithPassword
} from "@/lib/supabase-auth";
import { getPostLoginDestination } from "@/lib/platform-role";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Fyll i både e-postadress och lösenord." },
        { status: 400 }
      );
    }

    const session = await signInWithPassword(email, password);
    await saveAuthSession(session);

    return NextResponse.json({
      redirectTo: getPostLoginDestination(session.user)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Inloggningen misslyckades."
      },
      { status: 401 }
    );
  }
}
