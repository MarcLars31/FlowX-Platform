/** Session-owned cache: no cross-user/global data and no duplicate in-flight
 * requests. Unmounted consumers ignore results; a request can finish for reuse. */
export function createProductWorkspaceResource(request: typeof fetch = fetch) {
  const entries = new Map<string, Promise<unknown>>();
  return {
    load<T>(url: string, revision = ""): Promise<T> {
      const key = JSON.stringify([url, revision]);
      let promise = entries.get(key);
      if (!promise) {
        promise = request(url, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(120_000) })
          .then(async response => {
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload) throw new Error(payload?.error ?? "Uppgifterna kunde inte hämtas. Försök igen.");
            return payload;
          }).catch(error => { if (entries.get(key) === promise) entries.delete(key); throw error; });
        entries.set(key, promise);
      }
      return promise as Promise<T>;
    },
    invalidate(url: string) { for (const key of entries.keys()) if (JSON.parse(key)[0] === url) entries.delete(key); }
  };
}
export type ProductWorkspaceResource = ReturnType<typeof createProductWorkspaceResource>;
