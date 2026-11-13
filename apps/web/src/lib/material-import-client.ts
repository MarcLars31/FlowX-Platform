import type { MaterialReview, MaterialSearchInput, MaterialSearchResult } from "./material-import";
import { withCallerAbort } from "./single-flight";

export const MATERIAL_MATCH_TIMEOUT_MS = 65_000;
export const MATERIAL_QUEUE_INTERVAL_MS = 3_100;

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

type WaitReason = "rate-limit" | "retry" | "pace";
type WaitNotice = (seconds: number, reason?: WaitReason) => void;

async function waitWithCountdown(milliseconds: number, signal: AbortSignal, onWait: WaitNotice,
  reason: WaitReason, wait: typeof waitForMaterialRetry) {
  signal.throwIfAborted();
  const deadline = Date.now() + milliseconds;
  onWait(Math.ceil(milliseconds / 1000), reason);
  const timer = setInterval(() => onWait(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)), reason), 1000);
  try { await wait(milliseconds, signal); signal.throwIfAborted(); }
  finally { clearInterval(timer); }
  onWait(0, reason);
}

function retryAfterSeconds(value: string | null) {
  if (!value) return 30;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.max(1, seconds) : 30;
}

/** One row in flight; bound fetch AND response-body reads, retries and supplier pauses. */
export async function requestMaterialMatch(input: MaterialSearchInput, signal: AbortSignal, onWait: WaitNotice,
  fetchImpl: typeof fetch = fetch, wait = waitForMaterialRetry, timeoutMs = MATERIAL_MATCH_TIMEOUT_MS): Promise<MaterialSearchResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(new DOMException("Sökningen tog för lång tid.", "TimeoutError")), timeoutMs);
    const requestSignal = AbortSignal.any([signal, timeout.signal]);
    let response: Response;
    let payload: (MaterialSearchResult & { error?: string }) | null | undefined;
    try {
      ({ response, payload } = await withCallerAbort((async () => {
        const response = await fetchImpl("/api/material-import/match", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input), signal: requestSignal });
        if ([401, 403, 404, 429].includes(response.status)) return { response, payload: null };
        return { response, payload: await response.json().catch(() => null) as (MaterialSearchResult & { error?: string }) | null };
      })(), requestSignal));
    } catch (error) {
      signal.throwIfAborted();
      if (timeout.signal.aborted) throw new MaterialSearchRequestError("Raden tog för lång tid och kan sökas igen.", false);
      if (attempt < 2) {
        await waitWithCountdown((attempt + 1) * 2000, signal, onWait, "retry", wait);
        continue;
      }
      throw new MaterialSearchRequestError(error instanceof Error ? error.message : "Anslutningen avbröts. Försök igen.", false);
    } finally { clearTimeout(timer); }
    signal.throwIfAborted();
    if (response.status === 401 || response.status === 403) throw new MaterialSearchRequestError("Sökningen pausades. Kontrollera inloggningen och behörigheten innan du fortsätter.", true);
    if (response.status === 404) throw new MaterialSearchRequestError("Söktjänsten kunde inte hittas. Försök igen senare.", true);
    if (response.status === 429) {
      const seconds = retryAfterSeconds(response.headers.get("Retry-After"));
      if (attempt === 2 || seconds > 300) throw new MaterialSearchRequestError(`Sökningen pausades. Vänta ${seconds} sekunder och välj Sök återstående för att fortsätta.`, true);
      await waitWithCountdown(seconds * 1000, signal, onWait, "rate-limit", wait);
      continue;
    }
    const invalidResponse = !payload || !Array.isArray(payload.candidates);
    if (response.status >= 500 || (response.ok && invalidResponse)) {
      if (attempt < 2) {
        await waitWithCountdown((attempt + 1) * 2000, signal, onWait, "retry", wait);
        continue;
      }
      throw new MaterialSearchRequestError(payload?.error ?? "Söktjänsten kunde inte besvara raden. Den kan sökas igen.", false);
    }
    if (!payload || !response.ok || invalidResponse) throw new MaterialSearchRequestError(payload?.error ?? "Sökningen kunde inte slutföras.", false);
    return payload;
  }
  throw new MaterialSearchRequestError("Sökningen kunde inte slutföras.", true);
}

export type MaterialQueueProgress = {
  id: string; index: number; total: number; phase: "searching" | "waiting"; seconds: number; reason?: WaitReason; startedAt: number;
};

/** Process the entire supplied batch, independent of table pagination or filters. */
export async function runMaterialSearchQueue({ ids, reviews, signal, onReview, onProgress,
  match = requestMaterialMatch, wait = waitForMaterialRetry, now = Date.now }: {
  ids: string[]; reviews: Record<string, MaterialReview>; signal: AbortSignal;
  onReview: (id: string, review: MaterialReview) => void; onProgress: (progress: MaterialQueueProgress) => void;
  match?: typeof requestMaterialMatch; wait?: typeof waitForMaterialRetry; now?: () => number;
}) {
  let completed = 0, failed = 0, consecutiveFailures = 0;
  let lastStarted: number | null = null;
  let error = "";
  let stopped = false;
  for (const [index, id] of ids.entries()) {
    if (signal.aborted) break;
    const original = reviews[id];
    if (!original) continue;
    const notice: WaitNotice = (seconds, reason) => onProgress({ id, index: index + 1, total: ids.length,
      phase: seconds > 0 ? "waiting" : "searching", seconds, reason, startedAt: now() });
    onReview(id, { ...original, status: "searching", error: undefined });
    try {
      const delay = lastStarted === null ? 0 : Math.max(0, MATERIAL_QUEUE_INTERVAL_MS - (now() - lastStarted));
      if (delay) await waitWithCountdown(delay, signal, notice, "pace", wait);
      signal.throwIfAborted();
      lastStarted = now(); notice(0);
      const result = await match(original.input, signal, notice);
      signal.throwIfAborted();
      onReview(id, { input: original.input, result, status: result.candidates.length ? "review" : "empty" });
      completed++; consecutiveFailures = 0;
    } catch (cause) {
      if (signal.aborted) { onReview(id, original); break; }
      const rowError = cause instanceof Error ? cause.message : "Sökningen misslyckades.";
      onReview(id, { ...original, status: "error", error: rowError });
      failed++; consecutiveFailures++;
      if ((cause instanceof MaterialSearchRequestError && cause.stopQueue) || consecutiveFailures >= 3) {
        error = consecutiveFailures >= 3 ? "Sökningen pausades efter tre sökfel i följd. Tidigare resultat finns kvar. Välj Sök återstående för att fortsätta." : rowError;
        stopped = true; break;
      }
    }
  }
  return { completed, failed, stopped, error, cancelled: signal.aborted };
}
