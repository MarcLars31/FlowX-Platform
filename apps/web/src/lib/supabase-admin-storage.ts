import "server-only";
import { buildSupabaseHeaders } from "@/lib/supabase-headers";

type StorageConfig = { url: string; key: string };

export class StorageObjectTooLargeError extends Error {
  constructor() {
    super("Storage object exceeds the configured size limit.");
    this.name = "StorageObjectTooLargeError";
  }
}

export async function downloadAdminStorageObject(
  bucket: string,
  path: string,
  options: { maxBytes?: number } = {}
) {
  const config = storageConfig();
  const response = await fetch(storageObjectUrl(config.url, bucket, path), {
    headers: buildSupabaseHeaders(config.key),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Storage download failed with HTTP ${response.status}.`);
  }

  if (options.maxBytes === undefined) {
    return new Uint8Array(await response.arrayBuffer());
  }
  if (Number(response.headers.get("content-length")) > options.maxBytes) {
    await response.body?.cancel();
    throw new StorageObjectTooLargeError();
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > options.maxBytes) {
        await reader.cancel();
        throw new StorageObjectTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** The returned capability permits uploading one object, without exposing a key. */
export async function createAdminStorageUploadUrl(bucket: string, path: string) {
  const config = storageConfig();
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const root = `${config.url.replace(/\/$/, "")}/storage/v1`;
  const endpoint = `${root}/object/upload/sign/${encodeURIComponent(bucket)}/${encodedPath}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { ...buildSupabaseHeaders(config.key), "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Storage signing failed with HTTP ${response.status}.`);
  const payload = await response.json() as { url?: unknown };
  if (typeof payload.url !== "string") throw new Error("Storage returned no upload URL.");
  const signedUrl = new URL(`${root}${payload.url}`);
  // Never forward an unexpected destination or permit overwriting an object.
  if (
    signedUrl.origin !== new URL(root).origin ||
    signedUrl.pathname !== new URL(endpoint).pathname ||
    !signedUrl.searchParams.get("token")
  ) throw new Error("Storage returned an invalid upload URL.");
  return signedUrl.toString();
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
