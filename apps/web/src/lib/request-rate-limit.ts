type RateLimitBucket = {
  timestamps: number[];
  lastSeen: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 10_000;

/** Defense-in-depth limiter for warm workers; use an edge limiter in production too. */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindow = Math.max(1_000, Math.floor(windowMs));
  const cutoff = now - safeWindow;
  const bucket = buckets.get(key) ?? { timestamps: [], lastSeen: now };

  bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > cutoff);
  bucket.lastSeen = now;

  if (bucket.timestamps.length >= safeLimit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.timestamps[0] + safeWindow - now) / 1000));
    buckets.set(key, bucket);
    pruneBuckets(now);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  pruneBuckets(now);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function requestRateLimitKey(request: Request, scope: string, subject?: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const address = (realIp || forwarded || "unknown").slice(0, 100);
  return `${scope}:${address}:${(subject ?? "").slice(0, 160)}`;
}

function pruneBuckets(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.lastSeen < now - 15 * 60_000) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
  }
}
