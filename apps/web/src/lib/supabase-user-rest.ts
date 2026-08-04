import "server-only";
import { getCurrentAccessToken } from "@/lib/supabase-auth";

type UserSupabaseConfig = {
  url: string;
  publishableKey: string;
  accessToken: string;
};

export class UserSupabaseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "UserSupabaseError";
  }
}

export async function selectUserRows<T>(
  table: string,
  params: Record<string, string> = {}
) {
  const config = await getUserSupabaseConfig();
  const url = restUrl(config.url, table);

  url.searchParams.set("select", params.select ?? "*");
  Object.entries(params).forEach(([key, value]) => {
    if (key !== "select") url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    method: "GET",
    headers: userHeaders(config),
    cache: "no-store"
  });

  if (!response.ok) throw await readUserSupabaseError(response);
  return (await response.json()) as T[];
}

export async function insertUserRowReturning<T>(
  table: string,
  payload: Record<string, unknown>
) {
  const config = await getUserSupabaseConfig();
  const response = await fetch(restUrl(config.url, table), {
    method: "POST",
    headers: userHeaders(config, "return=representation"),
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) throw await readUserSupabaseError(response);

  const rows = (await response.json()) as T[];
  const row = rows[0];
  if (!row) throw new Error(`Supabase insert into ${table} returned no row.`);
  return row;
}

export async function updateUserRowsReturning<T>(
  table: string,
  filters: Record<string, string>,
  payload: Record<string, unknown>
) {
  const config = await getUserSupabaseConfig();
  const url = restUrl(config.url, table);
  url.searchParams.set("select", "*");
  Object.entries(filters).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    method: "PATCH",
    headers: userHeaders(config, "return=representation"),
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) throw await readUserSupabaseError(response);

  const rows = (await response.json()) as T[];
  const row = rows[0];
  if (!row) throw new Error(`Supabase update of ${table} returned no row.`);
  return row;
}

export async function deleteUserRows(
  table: string,
  filters: Record<string, string>
) {
  const config = await getUserSupabaseConfig();
  const url = restUrl(config.url, table);
  Object.entries(filters).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    method: "DELETE",
    headers: userHeaders(config),
    cache: "no-store"
  });

  if (!response.ok) throw await readUserSupabaseError(response);
}

export async function callUserRpc<T>(
  functionName: string,
  payload: Record<string, unknown>
) {
  const config = await getUserSupabaseConfig();
  const response = await fetch(restUrl(config.url, `rpc/${functionName}`), {
    method: "POST",
    headers: userHeaders(config, "return=representation"),
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) throw await readUserSupabaseError(response);
  return (await response.json()) as T;
}

async function getUserSupabaseConfig(): Promise<UserSupabaseConfig> {
  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const accessToken = await getCurrentAccessToken();

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase user access is not configured. Set the Supabase URL and publishable key."
    );
  }

  if (!accessToken) {
    throw new UserSupabaseError("Authentication is required.", 401);
  }

  return { url, publishableKey, accessToken };
}

function userHeaders(config: UserSupabaseConfig, prefer = "return=minimal") {
  return {
    apikey: config.publishableKey,
    Authorization: `Bearer ${config.accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    Prefer: prefer
  };
}

function restUrl(supabaseUrl: string, resource: string) {
  if (!/^[a-z0-9_/-]+$/i.test(resource)) {
    throw new Error("Invalid Supabase REST resource.");
  }

  const baseUrl = supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`;
  return new URL(`rest/v1/${resource}`, baseUrl);
}

async function readUserSupabaseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
      }
    | null;
  const message = [
    payload?.message ?? `Supabase request failed (${response.status}).`,
    payload?.details,
    payload?.hint
  ]
    .filter(Boolean)
    .join(" ");

  return new UserSupabaseError(message, response.status, payload?.code);
}
