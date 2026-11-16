/** Share only work currently in progress. Completed responses are never retained here. */
export function createSingleFlight<T>(maxEntries = 100) {
  const pending = new Map<string, Promise<T>>();
  return function run(key: string, work: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= maxEntries) return Promise.reject(new Error("Too many concurrent requests"));
    const promise = Promise.resolve().then(work);
    pending.set(key, promise);
    void promise.finally(() => { if (pending.get(key) === promise) pending.delete(key); }).catch(() => undefined);
    return promise;
  };
}
export async function withCallerAbort<T>(promise: Promise<T>, signal?: AbortSignal | null) {
  if (!signal) return promise;
  signal.throwIfAborted();
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(signal.reason); signal.addEventListener("abort", onAbort, {once:true}); });
  try { return await Promise.race([promise, aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
