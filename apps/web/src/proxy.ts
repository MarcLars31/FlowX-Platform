import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE,
  authHeaders,
  authUrl,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
  shouldRefreshAccessToken
} from "@/lib/supabase-auth-config";

type RefreshedSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export async function proxy(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken || !shouldRefreshAccessToken(accessToken)) {
    return NextResponse.next();
  }

  try {
    const session = await refreshAuthSession(refreshToken);
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
  } catch {
    request.cookies.delete(ACCESS_COOKIE);
    request.cookies.delete(REFRESH_COOKIE);

    const response = NextResponse.next({ request });
    response.cookies.delete(ACCESS_COOKIE);
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }
}

async function refreshAuthSession(refreshToken: string) {
  const response = await fetch(authUrl("token?grant_type=refresh_token"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Supabase session refresh failed.");
  }

  return (await response.json()) as RefreshedSession;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
