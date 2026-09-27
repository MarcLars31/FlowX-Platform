import { NextRequest, NextResponse } from "next/server";
import { refreshSession, SessionRefreshError } from "@/lib/session-refresh";
import {
  ACCESS_COOKIE,
  authHeaders,
  authUrl,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
  shouldRefreshAccessToken
} from "@/lib/supabase-auth-config";

// Keep session refresh in Edge middleware until the Cloudflare adapter can bundle Next 16 Node proxy files.

export async function middleware(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken || !shouldRefreshAccessToken(accessToken)) {
    return NextResponse.next();
  }

  try {
    const session = await refreshSession(authUrl("token?grant_type=refresh_token"), authHeaders(), refreshToken);
    request.cookies.set(ACCESS_COOKIE, session.access_token);
    request.cookies.set(REFRESH_COOKIE, session.refresh_token);

    const response = NextResponse.next({ request });
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/"
    };

    response.cookies.set(ACCESS_COOKIE, session.access_token, {
      ...cookieOptions,
      maxAge: session.expires_in
    });
    response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
      ...cookieOptions,
      maxAge: REFRESH_COOKIE_MAX_AGE
    });

    return response;
  } catch (error) {
    if (!(error instanceof SessionRefreshError) || !error.invalidSession) {
      // Never execute a protected route with an expired token or redirect into
      // a login loop. A reload safely retries the retained session.
      console.warn("session_refresh_temporarily_unavailable", { status: error instanceof SessionRefreshError ? error.status : 503 });
      return request.nextUrl.pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Inloggningstjänsten är tillfälligt otillgänglig. Försök igen." }, { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } })
        : new NextResponse('<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Försök igen</title><body><h1>Anslutningen kunde inte förnyas</h1><p>Din session finns kvar. Ladda om sidan om en stund.</p><a href="">Försök igen</a></body></html>', { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "5", "Cache-Control": "no-store" } });
    }
    request.cookies.delete(ACCESS_COOKIE);
    request.cookies.delete(REFRESH_COOKIE);

    const response = NextResponse.next({ request });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
