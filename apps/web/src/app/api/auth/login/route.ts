import { NextResponse } from "next/server";
import {
  saveAuthSession,
  signInWithPassword
} from "@/lib/supabase-auth";
import { getPostLoginDestination } from "@/lib/platform-role";
import { consumeRateLimit, requestRateLimitKey } from "@/lib/request-rate-limit";
import {
  readJsonBody,
  RequestBodyTooLargeError
} from "@/lib/request-body";

const maxLoginBodyBytes = 32 * 1024;

export async function POST(request: Request) {
  try {
    const body = (await readJsonBody<{
      email?: string;
      password?: string;
    }>(request, maxLoginBodyBytes));
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Fyll i både e-postadress och lösenord." },
        { status: 400 }
      );
    }

    const ipLimit = consumeRateLimit(requestRateLimitKey(request, "login-ip"), 12, 5 * 60_000);
    const accountLimit = consumeRateLimit(requestRateLimitKey(request, "login-account", email), 8, 5 * 60_000);
    if (!ipLimit.allowed || !accountLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds);
      return NextResponse.json(
        { error: "För många inloggningsförsök. Försök igen senare." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
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
        error: "Inloggningen misslyckades. Kontrollera uppgifterna och försök igen."
      },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 401 }
    );
  }
}
