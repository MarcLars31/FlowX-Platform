export const MAX_AHLSELL_PRODUCT_SUBTITLE_ITEMS = 6;

export type AhlsellProductSubtitleItem = {
  articleNumber: string;
  productUrl: string;
};

type CachedSubtitle = {
  expiresAt: number;
  promise: Promise<string | null>;
};

const ALLOWED_AHLSELL_HOSTS = new Set([
  "ahlsell.no",
  "www.ahlsell.no",
  "ahlsell.se",
  "www.ahlsell.se"
]);
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_REDIRECTS = 2;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const MAX_OUTBOUND_FETCHES = 6;
const SUCCESS_CACHE_TTL_MS = 12 * 60 * 60_000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 1_000;
const MAX_SUBTITLE_LENGTH = 500;
const subtitleCache = new Map<string, CachedSubtitle>();
let activeOutboundFetches = 0;
const outboundFetchWaiters: Array<{
  resolve: (release: () => void) => void;
  reject: (reason: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}> = [];

export function validateAhlsellProductSubtitleItems(value: unknown):
  | { data: AhlsellProductSubtitleItem[] }
  | { error: string } {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return { error: "Produktlistan saknas." };
  }
  if (value.items.length === 0 || value.items.length > MAX_AHLSELL_PRODUCT_SUBTITLE_ITEMS) {
    return { error: `Välj mellan 1 och ${MAX_AHLSELL_PRODUCT_SUBTITLE_ITEMS} synliga produkter.` };
  }

  const items: AhlsellProductSubtitleItem[] = [];
  const seenArticleNumbers = new Set<string>();
  for (const rawItem of value.items) {
    if (!isRecord(rawItem)) return { error: "En produkt har ogiltigt format." };
    const articleNumber = text(rawItem.articleNumber, 40).replace(/\s+/g, "");
    if (!articleNumber || !/^[a-z0-9][a-z0-9._-]*$/i.test(articleNumber)) {
      return { error: "Ett NRF-nummer har ogiltigt format." };
    }
    const productUrl = safeAhlsellProductUrl(rawItem.productUrl, articleNumber);
    if (!productUrl) return { error: "En produktlänk går inte till Ahlsell." };

    const articleKey = articleNumber.toLocaleLowerCase("sv-SE");
    if (seenArticleNumbers.has(articleKey)) continue;
    seenArticleNumbers.add(articleKey);
    items.push({ articleNumber, productUrl });
  }

  return items.length > 0 ? { data: items } : { error: "Produktlistan saknas." };
}

export function parseAhlsellProductSubtitle(html: string) {
  const headingStart = /<h1\b(?=[^>]*\bdata-test\s*=\s*["']product-name["'])[^>]*>/i.exec(html);
  if (!headingStart || headingStart.index < 0) return null;
  const headingCloseIndex = html.toLocaleLowerCase("en-US").indexOf(
    "</h1>",
    headingStart.index + headingStart[0].length
  );
  if (headingCloseIndex < 0) return null;

  const headingMarkup = html.slice(
    headingStart.index + headingStart[0].length,
    headingCloseIndex
  );
  const afterHeading = html.slice(headingCloseIndex + "</h1>".length);
  const subtitleMatch = afterHeading.match(
    /^(?:(?:\s+)|(?:<!--[\s\S]*?-->))*<div\b[^>]*>([\s\S]*?)<\/div>/i
  );
  if (!subtitleMatch) return null;

  const heading = stripMarkup(headingMarkup);
  const subtitle = stripMarkup(subtitleMatch[1]).slice(0, MAX_SUBTITLE_LENGTH);
  if (!subtitle || subtitle.toLocaleLowerCase("sv-SE") === heading.toLocaleLowerCase("sv-SE")) {
    return null;
  }
  return subtitle;
}

export async function fetchAhlsellProductSubtitles({
  items,
  fetchImpl = fetch,
  signal
}: {
  items: AhlsellProductSubtitleItem[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}) {
  const subtitles: Record<string, string | null> = {};
  let cursor = 0;
  const workerCount = Math.min(3, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      subtitles[item.articleNumber] = await fetchAhlsellProductSubtitle(
        item.articleNumber,
        item.productUrl,
        fetchImpl,
        signal
      ).catch(() => null);
    }
  }));

  return subtitles;
}

async function fetchAhlsellProductSubtitle(
  articleNumber: string,
  productUrl: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal
) {
  const safeUrl = safeAhlsellProductUrl(productUrl, articleNumber);
  if (!safeUrl) return null;
  if (fetchImpl !== fetch) {
    return fetchAhlsellProductSubtitleUncached(articleNumber, safeUrl, fetchImpl, signal);
  }

  const cached = subtitleCache.get(safeUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  if (cached) subtitleCache.delete(safeUrl);

  // A disconnected browser request must not poison the shared cache. Let the
  // first connected caller populate it, while later callers still benefit.
  if (signal) {
    try {
      const subtitle = await fetchAhlsellProductSubtitleUncached(
        articleNumber,
        safeUrl,
        fetchImpl,
        signal
      );
      if (!signal.aborted) cacheResolvedSubtitle(safeUrl, subtitle);
      return subtitle;
    } catch (error) {
      if (signal.aborted) throw error;
      cacheResolvedSubtitle(safeUrl, null);
      return null;
    }
  }

  const cacheEntry: CachedSubtitle = {
    expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS,
    promise: Promise.resolve(null)
  };
  cacheEntry.promise = fetchAhlsellProductSubtitleUncached(articleNumber, safeUrl, fetchImpl)
    .catch(() => null)
    .then((subtitle) => {
      cacheEntry.expiresAt = Date.now() + (
        subtitle ? SUCCESS_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS
      );
      return subtitle;
    });
  subtitleCache.set(safeUrl, cacheEntry);
  trimCache();
  return cacheEntry.promise;
}

function cacheResolvedSubtitle(safeUrl: string, subtitle: string | null) {
  subtitleCache.set(safeUrl, {
    expiresAt: Date.now() + (subtitle ? SUCCESS_CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS),
    promise: Promise.resolve(subtitle)
  });
  trimCache();
}

async function fetchAhlsellProductSubtitleUncached(
  articleNumber: string,
  productUrl: string,
  fetchImpl: typeof fetch,
  externalSignal?: AbortSignal
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  let releaseOutboundSlot: (() => void) | undefined;
  try {
    releaseOutboundSlot = await acquireOutboundFetchSlot(controller.signal);
    let currentUrl = productUrl;
    let redirects = 0;

    while (true) {
      const url = new URL(currentUrl);
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": url.hostname.endsWith(".no") ? "no,en;q=0.8" : "sv,en;q=0.8",
          "User-Agent": "Scipx-Ahlsell-Public-Product/1.0 (+https://www.scipx.ai)"
        },
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal
      });

      if (isRedirectStatus(response.status)) {
        if (redirects >= MAX_REDIRECTS) return null;
        const location = response.headers.get("location");
        if (!location) return null;
        let redirectUrl: string;
        try {
          redirectUrl = new URL(location, url).toString();
        } catch {
          return null;
        }
        const safeRedirectUrl = safeAhlsellProductUrl(redirectUrl, articleNumber);
        if (!safeRedirectUrl) return null;
        currentUrl = safeRedirectUrl;
        redirects += 1;
        continue;
      }

      if (!response.ok) return null;
      const contentType = response.headers.get("content-type")?.toLocaleLowerCase("en-US") ?? "";
      if (contentType && !contentType.includes("text/html")) return null;
      const html = await readResponseTextWithinLimit(response, MAX_RESPONSE_BYTES);
      return html === null ? null : parseAhlsellProductSubtitle(html);
    }
  } finally {
    releaseOutboundSlot?.();
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

function safeAhlsellProductUrl(value: unknown, articleNumber: string) {
  const rawUrl = text(value, 2_000);
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || !ALLOWED_AHLSELL_HOSTS.has(url.hostname.toLocaleLowerCase("en-US"))
      || !url.pathname.toLocaleLowerCase("en-US").startsWith("/products/")
      || !urlPathContainsArticleNumber(url.pathname, articleNumber)
    ) {
      return null;
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function urlPathContainsArticleNumber(pathname: string, articleNumber: string) {
  const normalizedArticleNumber = normalizeArticleToken(articleNumber);
  if (!normalizedArticleNumber) return false;

  let decodedPathname = pathname;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const pathTokens = decodedPathname.split(/[^a-z0-9]+/i);
  if (pathTokens.some((token) => normalizeArticleToken(token) === normalizedArticleNumber)) {
    return true;
  }

  return decodedPathname
    .split(/\/|---/)
    .some((token) => normalizeArticleToken(token) === normalizedArticleNumber);
}

function normalizeArticleToken(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readResponseTextWithinLimit(response: Response, maxBytes: number) {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) return null;
  }

  if (!response.body) {
    const value = await response.text();
    return new TextEncoder().encode(value).byteLength <= maxBytes ? value : null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let value = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytesRead += chunk.value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        return null;
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    value += decoder.decode();
    return value;
  } finally {
    reader.releaseLock();
  }
}

function acquireOutboundFetchSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(createAbortError());
  if (activeOutboundFetches < MAX_OUTBOUND_FETCHES) {
    activeOutboundFetches += 1;
    return Promise.resolve(releaseOutboundFetchSlot);
  }

  return new Promise((resolve, reject) => {
    const waiter: (typeof outboundFetchWaiters)[number] = { resolve, reject, signal };
    waiter.onAbort = () => {
      const index = outboundFetchWaiters.indexOf(waiter);
      if (index >= 0) outboundFetchWaiters.splice(index, 1);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", waiter.onAbort, { once: true });
    outboundFetchWaiters.push(waiter);
  });
}

function releaseOutboundFetchSlot() {
  const waiter = outboundFetchWaiters.shift();
  if (waiter) {
    if (waiter.onAbort) waiter.signal?.removeEventListener("abort", waiter.onAbort);
    waiter.resolve(releaseOutboundFetchSlot);
    return;
  }
  activeOutboundFetches = Math.max(0, activeOutboundFetches - 1);
}

function createAbortError() {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function stripMarkup(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\""
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, token: string) => {
    if (token[0] !== "#") return named[token.toLocaleLowerCase("en-US")] ?? entity;
    const hexadecimal = token[1]?.toLocaleLowerCase("en-US") === "x";
    const codePoint = Number.parseInt(token.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    try {
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    } catch {
      return entity;
    }
  });
}

function trimCache() {
  while (subtitleCache.size > CACHE_MAX_ENTRIES) {
    const oldestKey = subtitleCache.keys().next().value;
    if (typeof oldestKey !== "string") return;
    subtitleCache.delete(oldestKey);
  }
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
