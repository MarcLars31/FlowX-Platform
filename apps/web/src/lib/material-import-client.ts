import type { MaterialSearchInput, MaterialSearchResult } from "./material-import";

export class MaterialSearchRequestError extends Error {
  constructor(message: string, readonly stopQueue: boolean) { super(message); }
}

export function waitForMaterialRetry(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", aborted); resolve(); }, milliseconds);
    signal.addEventListener("abort", aborted, { once: true });
  });
}

/** One row in flight; supplier backoff is respected, bounded and cancellable. */
export async function requestMaterialMatch(input: MaterialSearchInput, signal: AbortSignal, onWait: (seconds: number) => void,
  fetchImpl: typeof fetch = fetch, wait = waitForMaterialRetry): Promise<MaterialSearchResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetchImpl("/api/material-import/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal });
    } catch (error) {
      signal.throwIfAborted();
      throw new MaterialSearchRequestError(error instanceof Error ? error.message : "Anslutningen avbröts. Försök igen.", true);
    }
    if (response.status === 429) {
      const seconds = Math.max(1, Math.min(300, Number(response.headers.get("Retry-After")) || 30));
      if (attempt === 2) throw new MaterialSearchRequestError(`Sökningen pausades. Vänta ${seconds} sekunder och välj Sök återstående för att fortsätta.`, true);
      onWait(seconds); await wait(seconds * 1000, signal); continue;
    }
    const stopQueue = response.status === 401 || response.status === 403 || response.status >= 500;
    let payload: MaterialSearchResult & { error?: string };
    try { payload = await response.json(); }
    catch { throw new MaterialSearchRequestError("Ett ogiltigt svar avbröt sökningen. Försök igen.", true); }
    if (!response.ok || !Array.isArray(payload?.candidates)) throw new MaterialSearchRequestError(payload?.error ?? "Sökningen kunde inte slutföras.", stopQueue || response.ok);
    signal.throwIfAborted();
    return payload;
  }
  throw new MaterialSearchRequestError("Sökningen kunde inte slutföras.", true);
}
