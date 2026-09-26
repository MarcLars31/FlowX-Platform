import { buildSupabaseHeaders } from "./supabase-headers";
import type { AhlsellEvidenceSnapshot, AhlsellEvidenceStore } from "./ahlsell-technical-evidence";

/** Private, server-written cache; no customer PDF text, prices or credentials.
 * A cache failure must not stop live matching. Callers validate stored payloads. */
export function createAhlsellEvidenceStorage(config: { url: string; key: string }, fetchImpl: typeof fetch = fetch): AhlsellEvidenceStore {
  function url(market: "no" | "se", article: string) {
    if (!/^[a-z0-9][a-z0-9._-]{0,39}$/i.test(article) || !["no", "se"].includes(market)) throw new Error("Invalid article cache key");
    return new URL(`storage/v1/object/product-documents/ahlsell-technical-evidence/v1/${market}/${encodeURIComponent(article.toLowerCase())}.json`, config.url.replace(/\/?$/, "/"));
  }
  return {
    async read(market, article) {
      const response = await fetchImpl(url(market, article), { headers: buildSupabaseHeaders(config.key), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(1500) });
      if (!response.ok) { await response.body?.cancel(); return null; }
      // Cached documents are bounded even if storage contains malformed data.
      const reader = response.body?.getReader();
      if (!reader) return null;
      let bytes = 0; let text = "";
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 64_000) { await reader.cancel(); return null; }
          text += decoder.decode(chunk.value, { stream: true });
        }
        return JSON.parse(text + decoder.decode()) as unknown;
      } finally { reader.releaseLock(); }
    },
    async write(market, article, snapshot: AhlsellEvidenceSnapshot) {
      const body = JSON.stringify(snapshot);
      if (new TextEncoder().encode(body).byteLength > 64_000) return;
      const response = await fetchImpl(url(market, article), { method: "POST", headers: {
        ...buildSupabaseHeaders(config.key), "Content-Type": "application/json", "x-upsert": "true"
      }, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(1500) });
      await response.body?.cancel();
      if (!response.ok) throw new Error(`Article evidence cache write failed (${response.status})`);
    }
  };
}
