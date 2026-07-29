import "server-only";
import { cookies } from "next/headers";

const ACCESS_COOKIE = "flowx_access_token";
const REFRESH_COOKIE = "flowx_refresh_token";

type AuthConfig = {
  url: string;
  apiKey: string;
};

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

function getAuthConfig(): AuthConfig {
  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !apiKey) {
    throw new Error(
      "Supabase Auth is not configured. Set a Supabase URL and publishable key."
    );
  }

  return { url, apiKey };
}

function authUrl(path: string) {
  const { url } = getAuthConfig();
  const baseUrl = url.endsWith("/") ? url : `${url}/`;
  return new URL(`auth/v1/${path}`, baseUrl);
}

function authHeaders(accessToken?: string) {
  const { apiKey } = getAuthConfig();

  return {
    apikey: apiKey,
    Authorization: `Bearer ${accessToken ?? apiKey}`,
    "Content-Type": "application/json"
  };
}

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
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!accessToken) return null;

  const response = await fetch(authUrl("user"), {
    headers: authHeaders(accessToken),
    cache: "no-store"
  });

  if (!response.ok) return null;

  return (await response.json()) as FlowXUser;
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
    maxAge: 60 * 60 * 24 * 30
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
