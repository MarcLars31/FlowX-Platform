import { createSingleFlight, withCallerAbort } from "./single-flight";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { callSupabaseRpc } from "./supabase-rest";

type CachedResponse = { body: string; encoding?: "gzip-base64"; status: number; headers: Record<string, string> };
type Claim = { state: "cached" | "pending" | "limited" | "acquired"; response?: CachedResponse; retryAfter?: number };

/** Keep supplier throttling visible even when the catalog retains local hits. */
export function ahlsellRequestContext() {
  let retryAfter = 0;
  return {
    get retryAfter() { return retryAfter; },
    fetch: (async (input, init) => {
      const response = await sharedAhlsellFetch(input, init);
      if (response.status === 429) retryAfter = Math.max(retryAfter, retrySeconds(response.headers.get("retry-after"), 5));
      return response;
    }) as typeof fetch
  };
}

/** Global quota + short leases/cache, shared by independent Vercel instances.
 * Fail closed if coordination is unavailable; never amplify an outage. */
type BufferedSupplierResponse = { body: string | null; status: number; headers: Record<string, string> };
const supplierFlights = createSingleFlight<BufferedSupplierResponse>();
export const sharedAhlsellFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== "https:" || !["www.ahlsell.no", "www.ahlsell.se"].includes(url.hostname)
    || (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase() !== "GET" || url.username || url.password) throw new Error("Invalid supplier request");
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  if (headers.has("cookie") || headers.has("authorization")) throw new Error("Private supplier responses cannot be shared");
  const key = createHash("sha256").update(`${url.href}|${headers.get("accept")}|${headers.get("accept-language")}`).digest("hex");
  const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
  const response = await withCallerAbort(supplierFlights(key, async () => {
    const result = await fetchClaimedSupplier(url, { ...init, signal: undefined }, key);
    return { body: result.body ? await result.text() : null, status: result.status, headers: Object.fromEntries(result.headers) };
  }), signal);
  // A cloned redirect body cannot finish cancellation while its original branch
  // is unread. Share the bounded payload, then give each caller its own stream.
  return new Response(response.body, response);
};

async function fetchClaimedSupplier(url: URL, init: RequestInit, key: string) {
  const lease = randomUUID();
  const signal = AbortSignal.any([AbortSignal.timeout(12_000), ...(init.signal ? [init.signal] : [])]);
  let claim: Claim;
  const started = Date.now();
  let delay = 500;
  do {
    signal.throwIfAborted();
    claim = await callSupabaseRpc<Claim>("claim_ahlsell_request", { requested_key: key, requested_lease: lease });
    if (claim.state !== "pending") break;
    if (Date.now() - started >= 7000) return busyResponse(2);
    await new Promise(resolve => setTimeout(resolve, Math.min(delay, 7000 - (Date.now() - started))));
    delay = Math.min(3000, delay * 2);
  } while (true);
  if (claim.state === "cached" && claim.response) return new Response(claim.response.encoding === "gzip-base64"
    ? gunzipSync(Buffer.from(claim.response.body,"base64"),{maxOutputLength:2_000_000}).toString("utf8") : claim.response.body, claim.response);
  if (claim.state !== "acquired") return busyResponse(claim.retryAfter ?? 5);
  let cached: CachedResponse | null = null;
  let backoff = 0;
  try {
    const response = await fetch(url, { ...init, signal, redirect: "manual" });
    if (response.status === 429 || response.status >= 500) backoff = retrySeconds(response.headers.get("retry-after"), response.status === 429 ? 30 : 5);
    // Bound the stored body and memory, including chunked responses.
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); throw new Error("Supplier response too large"); }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString("utf8");
    const outputHeaders: Record<string, string> = {};
    for (const name of ["content-type", "location", "retry-after"]) {
      const value = response.headers.get(name); if (value) outputHeaders[name] = value;
    }
    if (response.status === 200) {
      const compressed = gzipSync(body).toString("base64");
      // At most 64 small entries in SQL: the cache must fit the Nano database.
      if (compressed.length <= 128_000) cached = {body:compressed,encoding:"gzip-base64",status:200,headers:outputHeaders};
    }
    return new Response(body || null, { status: response.status, headers: outputHeaders });
  } finally {
    await callSupabaseRpc("finish_ahlsell_request", { requested_key: key, requested_lease: lease, requested_response: cached, requested_backoff: backoff })
      .catch(() => console.warn("ahlsell_lease_release_failed"));
  }
};

function busyResponse(seconds: number) {
  return new Response("Produktsökningen är tillfälligt upptagen. Försök igen.", { status: 429, headers: { "Retry-After": String(seconds) } });
}
function retrySeconds(value: string | null, fallback: number) {
  if (!value) return fallback;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.max(1, Math.min(300, seconds)) : fallback;
}
