import { buildSupabaseHeaders } from "@/lib/supabase-headers";

export const ACCESS_COOKIE = "flowx_access_token";
export const REFRESH_COOKIE = "flowx_refresh_token";
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type AuthConfig = {
  url: string;
  apiKey: string;
};

export function getAuthConfig(): AuthConfig {
  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;
  const apiKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !apiKey) {
    throw new Error(
      "Supabase Auth is not configured. Set a Supabase URL and publishable key."
    );
  }

  return { url, apiKey };
}

export function authUrl(path: string) {
  const { url } = getAuthConfig();
  const baseUrl = url.endsWith("/") ? url : `${url}/`;
  return new URL(`auth/v1/${path}`, baseUrl);
}

export function authHeaders(accessToken?: string) {
  const { apiKey } = getAuthConfig();

  return {
    ...buildSupabaseHeaders(apiKey, accessToken),
    "Content-Type": "application/json"
  };
}

export function shouldRefreshAccessToken(
  accessToken: string | undefined,
  nowInSeconds = Math.floor(Date.now() / 1000)
) {
  if (!accessToken) return true;

  try {
    const payloadSegment = accessToken.split(".")[1];
    if (!payloadSegment) return true;

    const normalized = payloadSegment
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = JSON.parse(atob(normalized)) as { exp?: unknown };

    return (
      typeof payload.exp !== "number" || payload.exp <= nowInSeconds + 60
    );
  } catch {
    return true;
  }
}
