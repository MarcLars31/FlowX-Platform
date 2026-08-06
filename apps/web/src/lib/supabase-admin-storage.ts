import "server-only";
import { buildSupabaseHeaders } from "@/lib/supabase-headers";

type StorageConfig = { url: string; key: string };

export async function downloadAdminStorageObject(bucket: string, path: string) {
  const config = storageConfig();
  const response = await fetch(storageObjectUrl(config.url, bucket, path), {
    headers: buildSupabaseHeaders(config.key),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Storage download failed with HTTP ${response.status}.`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function uploadAdminStorageObject(
  bucket: string,
  path: string,
  file: Uint8Array,
  contentType: string
) {
  const config = storageConfig();
  const response = await fetch(storageObjectUrl(config.url, bucket, path), {
    method: "POST",
    headers: {
      ...buildSupabaseHeaders(config.key),
      "Content-Type": contentType,
      "x-upsert": "false"
    },
    body: Buffer.from(file),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Storage upload failed with HTTP ${response.status}.`);
  }
}

export async function deleteAdminStorageObjects(
  bucket: string,
  paths: string[]
) {
  if (paths.length === 0) return;
  const config = storageConfig();
  const base = config.url.endsWith("/") ? config.url : `${config.url}/`;
  const response = await fetch(
    new URL(`storage/v1/object/${encodeURIComponent(bucket)}`, base),
    {
      method: "DELETE",
      headers: {
        ...buildSupabaseHeaders(config.key),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prefixes: paths }),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Storage cleanup failed with HTTP ${response.status}.`);
  }
}

function storageConfig(): StorageConfig {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend Supabase Storage is not configured.");
  return { url, key };
}

function storageObjectUrl(base: string, bucket: string, path: string) {
  const root = base.endsWith("/") ? base : `${base}/`;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return new URL(`storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, root);
}
