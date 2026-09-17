import "server-only";
import { buildSupabaseHeaders } from "@/lib/supabase-headers";

type SupabaseConfig = {
  url: string;
  key: string;
  urlSource: string;
  keySource: string;
};

export type SupabaseDiagnostics = {
  urlConfigured: boolean;
  keyConfigured: boolean;
  urlSource?: string;
  keySource?: string;
  backendEnvFile?: string;
  frontendEnvFile?: string;
  cwd: string;
  envFiles: EnvFileDiagnostics[];
  hasPublishableKey: boolean;
};

type EnvFileDiagnostics = {
  path: string;
  exists: boolean;
  hasSupabaseUrl: boolean;
  hasServiceRoleKey: boolean;
  hasViteSupabaseUrl: boolean;
  hasVitePublishableKey: boolean;
};

export function getSupabaseConfig(): SupabaseConfig {
  const url = pickEnv([
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "VITE_SUPABASE_URL"
  ]);
  const key = pickEnv(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

  if (!url || !key) {
    throw new Error(
      "Missing backend Supabase configuration. Set SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) in the backend environment."
    );
  }

  return {
    url: url.value,
    key: key.value,
    urlSource: url.name,
    keySource: key.name
  };
}

export function getSupabaseDiagnostics(): SupabaseDiagnostics {
  const envFiles: EnvFileDiagnostics[] = [];
  const publishableKey = pickEnv([
    "SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  ]);

  try {
    const config = getSupabaseConfig();
    return {
      urlConfigured: true,
      keyConfigured: true,
      urlSource: config.urlSource,
      keySource: config.keySource,
      cwd: "server runtime",
      envFiles,
      hasPublishableKey: Boolean(publishableKey)
    };
  } catch {
    const url = pickEnv([
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "VITE_SUPABASE_URL"
    ]);
    const key = pickEnv(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);

    return {
      urlConfigured: Boolean(url),
      keyConfigured: Boolean(key),
      urlSource: url?.name,
      keySource: key?.name,
      cwd: "server runtime",
      envFiles,
      hasPublishableKey: Boolean(publishableKey)
    };
  }
}

function pickEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return { name, value };
  }

  return undefined;
}

export async function insertSupabaseRow(
  table: string,
  payload: Record<string, unknown>
) {
  const config = getSupabaseConfig();

  const response = await fetch(supabaseTableUrl(config.url, table), {
    method: "POST",
    headers: supabaseHeaders(config),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }
}

export async function insertSupabaseRowReturning<T>(
  table: string,
  payload: Record<string, unknown>
) {
  const config = getSupabaseConfig();

  const response = await fetch(supabaseTableUrl(config.url, table), {
    method: "POST",
    headers: supabaseHeaders(config, "application/json", "return=representation"),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  const rows = (await response.json()) as T[];
  const [row] = rows;

  if (!row) {
    throw new Error(`Supabase insert into ${table} returned no rows.`);
  }

  return row;
}

export async function updateSupabaseRowsReturning<T>(
  table: string,
  params: Record<string, string>,
  payload: Record<string, unknown>
) {
  const config = getSupabaseConfig();
  const url = supabaseTableUrl(config.url, table);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    method: "PATCH",
    headers: supabaseHeaders(config, "application/json", "return=representation"),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  return (await response.json()) as T[];
}

export async function callSupabaseRpc<T>(
  functionName: string,
  payload: Record<string, unknown>
) {
  const config = getSupabaseConfig();
  const baseUrl = config.url.endsWith("/") ? config.url : `${config.url}/`;
  const response = await fetch(new URL(`rest/v1/rpc/${functionName}`, baseUrl), {
    method: "POST",
    headers: supabaseHeaders(config, "application/json", "return=representation"),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  return (await response.json()) as T;
}

export async function selectSupabaseRows<T>(
  table: string,
  params?: Record<string, string>
) {
  const config = getSupabaseConfig();
  const url = supabaseTableUrl(config.url, table);
  url.searchParams.set("select", "*");
  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(config, "application/json")
  });

  if (!response.ok) {
    throw new Error(await readSupabaseError(response));
  }

  return (await response.json()) as T[];
}

export async function selectSupabaseRowsWithCount<T>(
  table: string,
  params?: Record<string, string>
) {
  const config = getSupabaseConfig();
  const url = supabaseTableUrl(config.url, table);
  url.searchParams.set("select", "*");
  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    method: "GET",
    headers: supabaseHeaders(config, "application/json", "count=exact"),
    cache: "no-store"
  });

  if (!response.ok) throw new Error(await readSupabaseError(response));
  const totalText = response.headers.get("content-range")?.split("/").at(-1);
  const total = totalText && totalText !== "*" ? Number(totalText) : 0;
  return {
    rows: (await response.json()) as T[],
    total: Number.isFinite(total) ? total : 0
  };
}

function supabaseHeaders(
  config: SupabaseConfig,
  accept?: string,
  prefer = "return=minimal"
) {
  return {
    ...buildSupabaseHeaders(config.key),
    "Content-Type": "application/json",
    Prefer: prefer,
    ...(accept ? { Accept: accept } : {})
  };
}

async function readSupabaseError(response: Response) {
  const text = await response.text();
  const prefix = `Supabase ${response.status}`;

  if (!text) return `${prefix}: request failed.`;

  try {
    const parsed = JSON.parse(text) as {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    };

    return [
      prefix,
      parsed.code,
      parsed.message,
      parsed.details,
      parsed.hint
    ]
      .filter(Boolean)
      .join(" - ");
  } catch {
    return `${prefix}: ${text}`;
  }
}

function supabaseTableUrl(supabaseUrl: string, table: string) {
  const baseUrl = supabaseUrl.endsWith("/") ? supabaseUrl : `${supabaseUrl}/`;
  return new URL(`rest/v1/${table}`, baseUrl);
}
