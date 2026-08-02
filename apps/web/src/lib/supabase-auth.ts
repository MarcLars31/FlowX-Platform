import "server-only";
import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  authHeaders,
  authUrl,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE
} from "@/lib/supabase-auth-config";

export type FlowXUser = {
  id: string;
  email?: string;
  app_metadata?: {
    role?: string;
  };
  user_metadata?: {
    full_name?: string;
    company_name?: string;
    role?: string;
  };
};

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: FlowXUser;
};

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch(authUrl("token?grant_type=password"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await readAuthError(response));
  }

  return (await response.json()) as AuthSession;
}

export async function getCurrentUser() {
  const accessToken = await getCurrentAccessToken();

  if (!accessToken) return null;

  const response = await fetch(authUrl("user"), {
    headers: authHeaders(accessToken),
    cache: "no-store"
  });

  if (!response.ok) return null;

  return (await response.json()) as FlowXUser;
}

export async function getCurrentAccessToken() {
  const cookieStore = await cookies();
  return cookieStore.get(ACCESS_COOKIE)?.value ?? null;
}

export async function saveAuthSession(session: AuthSession) {
  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/"
  };

  cookieStore.set(ACCESS_COOKIE, session.access_token, {
    ...cookieOptions,
    maxAge: session.expires_in
  });
  cookieStore.set(REFRESH_COOKIE, session.refresh_token, {
    ...cookieOptions,
    maxAge: REFRESH_COOKIE_MAX_AGE
  });
}

export async function clearAuthSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}

async function readAuthError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { msg?: string; message?: string; error_description?: string }
    | null;

  return (
    payload?.msg ??
    payload?.message ??
    payload?.error_description ??
    "Inloggningen misslyckades."
  );
}
