import "server-only";

import {
  authHeaders,
  authUrl,
  getAuthConfig
} from "@/lib/supabase-auth-config";

type AuthUserResponse = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

function getSecretKey() {
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    throw new Error(
      "Supabase Auth invitations are not configured. Set SUPABASE_SECRET_KEY on the server."
    );
  }
  return secretKey;
}

function secretHeaders(secretKey: string, accessToken?: string) {
  return {
    ...authHeaders(accessToken),
    apikey: secretKey,
    Authorization: `Bearer ${accessToken ?? secretKey}`
  };
}

export async function inviteUserByEmail(
  email: string,
  redirectTo: string,
  data: Record<string, unknown> = {}
) {
  const secretKey = getSecretKey();
  const response = await fetch(authUrl("invite"), {
    method: "POST",
    headers: secretHeaders(secretKey),
    body: JSON.stringify({ email, redirect_to: redirectTo, data }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await readAuthError(response));
  }

  return (await response.json()) as AuthUserResponse;
}

export async function getAuthUserWithAccessToken(accessToken: string) {
  const response = await fetch(authUrl("user"), {
    headers: authHeaders(accessToken),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(await readAuthError(response));
  return (await response.json()) as AuthUserResponse;
}

export async function updateAuthUserPassword(
  accessToken: string,
  password: string
) {
  const response = await fetch(authUrl("user"), {
    method: "PUT",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ password }),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(await readAuthError(response));
  return (await response.json()) as AuthUserResponse;
}

export async function callAuthRpcWithAccessToken<T>(
  accessToken: string,
  functionName: string,
  payload: Record<string, unknown>
) {
  const { url } = getAuthConfig();
  const baseUrl = url.endsWith("/") ? url : `${url}/`;
  const response = await fetch(
    new URL(`rest/v1/rpc/${functionName}`, baseUrl),
    {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
    cache: "no-store"
    }
  );

  if (!response.ok) throw new Error(await readAuthError(response));
  return (await response.json()) as T;
}

async function readAuthError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { msg?: string; message?: string; error_description?: string }
    | null;

  return (
    payload?.msg ??
    payload?.message ??
    payload?.error_description ??
    "Supabase Auth request failed."
  );
}
