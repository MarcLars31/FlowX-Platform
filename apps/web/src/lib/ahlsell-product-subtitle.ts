import { AHLSELL_EVIDENCE_TTL_MS, AHLSELL_EVIDENCE_VERSION, buildAhlsellTechnicalEvidence, mergeAhlsellTechnicalEvidence, technicalEvidenceWarnings, type AhlsellEvidenceSnapshot, type AhlsellEvidenceStore, type AhlsellTechnicalEvidence } from "./ahlsell-technical-evidence";
import type { AhlsellPublicCandidate } from "./ahlsell-public-match";

export const MAX_AHLSELL_PRODUCT_SUBTITLE_ITEMS = 6;

export type AhlsellProductSubtitleItem = {
  articleNumber: string;
  productUrl: string;
};

type CachedSubtitle = {
  expiresAt: number;
  promise: Promise<AhlsellProductDetails | null>;
};

export type AhlsellProductDetails = {
  articleNumber: string;
  subtitle: string | null;
  specifications: string[];
  description?: string;
  technicalEvidence?: AhlsellTechnicalEvidence;
  snapshot?: AhlsellEvidenceSnapshot;
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

/** The visible article beside the product heading identifies the exact variant. */
export function parseAhlsellProductArticleNumber(html: string) {
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const heading = /<h1\b(?=[^>]*\bdata-test\s*=\s*["']product-name["'])[^>]*>[\s\S]*?<\/h1>/i.exec(visible);
  if (!heading) return null;
  const header = visible.slice(heading.index + heading[0].length, heading.index + heading[0].length + 12_000).split(/<h[12]\b/i)[0];
  return /<span\b[^>]*class=["'][^"']*\btext-card-item-number\b[^"']*["'][^>]*>\s*(?:<span\b[^>]*>\s*)?([a-z0-9._-]+)\s*<\/span>/i.exec(header)?.[1] ?? null;
}

export async function fetchAhlsellProductSubtitles({
  items, fetchImpl = fetch, signal
}: {
  items: AhlsellProductSubtitleItem[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}) {
  const details = await fetchAhlsellProductDetails({ items, fetchImpl, signal });
  return Object.fromEntries(Object.entries(details).map(([article, detail]) => [article, detail?.subtitle ?? null]));
}

export async function fetchAhlsellProductDetails({
  items,
  fetchImpl = fetch,
  signal,
  store
}: {
  items: AhlsellProductSubtitleItem[];
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  store?: AhlsellEvidenceStore;
}) {
  const subtitles: Record<string, AhlsellProductDetails | null> = {};
  let cursor = 0;
  const workerCount = Math.min(3, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      subtitles[item.articleNumber] = await fetchStoredProductDetails(item, fetchImpl, signal, store).catch(() => null);
    }
  }));

  return subtitles;
}

async function fetchStoredProductDetails(item: AhlsellProductSubtitleItem, fetchImpl: typeof fetch, signal?: AbortSignal, store?: AhlsellEvidenceStore) {
  signal?.throwIfAborted();
  const url = safeAhlsellProductUrl(item.productUrl, item.articleNumber);
  if (!url) return null;
  const market = new URL(url).hostname.endsWith(".no") ? "no" : "se";
  if (store) {
    const cached = restoreAhlsellEvidenceSnapshot(await store.read(market, item.articleNumber).catch(() => null), item.articleNumber, market);
    signal?.throwIfAborted();
    if (cached) return cached;
  }
  const detail = await fetchAhlsellProductSubtitle(item.articleNumber, url, fetchImpl, signal);
  signal?.throwIfAborted();
  if (store && detail?.snapshot) await store.write(market, item.articleNumber, detail.snapshot).catch(() => undefined);
  return detail;
}

/** Reparse saved raw fields after validation; never trust arbitrary stored
 * normalized values or a different market/article. Expired data is refetched. */
export function restoreAhlsellEvidenceSnapshot(value: unknown, requestedArticle: string, market: "no" | "se", now = Date.now()): AhlsellProductDetails | null {
  if (!isRecord(value) || value.version !== AHLSELL_EVIDENCE_VERSION || typeof value.articleNumber !== "string"
    || !samePageArticle(requestedArticle, value.articleNumber) || typeof value.sourceUrl !== "string"
    || typeof value.retrievedAt !== "string" || typeof value.productName !== "string" || value.productName.length > 500
    || (value.subtitle !== null && (typeof value.subtitle !== "string" || value.subtitle.length > 500))
    || (value.description !== null && (typeof value.description !== "string" || value.description.length > 2000))
    || !Array.isArray(value.specifications) || value.specifications.length > 60
    || value.specifications.some(s => typeof s !== "string" || s.length > 400)) return null;
  const sourceUrl = safeAhlsellProductUrl(value.sourceUrl, requestedArticle) ?? safeAhlsellProductUrl(value.sourceUrl, value.articleNumber);
  const age = now - Date.parse(value.retrievedAt);
  if (!sourceUrl || !new URL(sourceUrl).hostname.endsWith(`.${market}`) || !Number.isFinite(age) || age < 0 || age > AHLSELL_EVIDENCE_TTL_MS) return null;
  const snapshot = value as unknown as AhlsellEvidenceSnapshot;
  return { articleNumber: snapshot.articleNumber, subtitle: snapshot.subtitle, specifications: snapshot.specifications,
    description: snapshot.description ?? undefined, technicalEvidence: buildAhlsellTechnicalEvidence(snapshot), snapshot };
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

  const cacheKey = `${normalizeArticleToken(articleNumber)}:${safeUrl}`;
  const cached = subtitleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  if (cached) subtitleCache.delete(cacheKey);

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
      if (!signal.aborted) cacheResolvedSubtitle(cacheKey, subtitle);
      return subtitle;
    } catch (error) {
      if (signal.aborted) throw error;
      cacheResolvedSubtitle(cacheKey, null);
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
  subtitleCache.set(cacheKey, cacheEntry);
  trimCache();
  return cacheEntry.promise;
}

function cacheResolvedSubtitle(safeUrl: string, subtitle: AhlsellProductDetails | null) {
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
  const page = await fetchAhlsellProductPage({ productUrl, articleNumber, fetchImpl, signal: externalSignal });
  return page ? parseAhlsellProductDetails(page.html, articleNumber, page.url) : null;
}

export function parseAhlsellProductDetails(html: string, requestedArticle: string, sourceUrl?: string): AhlsellProductDetails | null {
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const articleNumber = parseAhlsellProductArticleNumber(visible);
  if (!articleNumber) return null;
  // Ahlsell search uses e.g. 9254111N5 for a page displaying NRF 9254111.
  // Accept that known catalogue suffix only with matching visible page identity;
  // never strip suffixes globally or accept a replacement with different digits.
  if (!samePageArticle(requestedArticle, articleNumber)) return null;
  const information = visible.split(/data-test=["']information-table["']/i)[1]?.split(/<h[12]\b/i)[0] ?? "";
  const technicalList = /Teknisk[ae] data\s*(?:<\/[^>]+>\s*)*<ul\b[^>]*>([\s\S]*?)<\/ul>/i.exec(information)?.[1] ?? "";
  const specifications = [...technicalList.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .slice(0, 60).map(match => stripMarkup(match[1]).slice(0, 400)).filter(Boolean);
  const subtitle = parseAhlsellProductSubtitle(visible);
  if (!sourceUrl) return { articleNumber, subtitle, specifications };
  const safeUrl = safeAhlsellProductUrl(sourceUrl, requestedArticle) ?? safeAhlsellProductUrl(sourceUrl, articleNumber);
  if (!safeUrl) return null;
  const productName = stripMarkup(/<h1\b(?=[^>]*\bdata-test\s*=\s*["']product-name["'])[^>]*>([\s\S]*?)<\/h1>/i.exec(visible)?.[1] ?? "").slice(0, 500);
  const description = information.includes("<ul") ? stripMarkup(information.split(/<ul\b/i)[0].replace(/^["']?>/, "")).slice(0, 2000) || null : null;
  const snapshot: AhlsellEvidenceSnapshot = { version: AHLSELL_EVIDENCE_VERSION, articleNumber, sourceUrl: safeUrl,
    retrievedAt: new Date().toISOString(), productName, subtitle, description, specifications };
  return { articleNumber, subtitle, specifications, description: description ?? undefined,
    technicalEvidence: buildAhlsellTechnicalEvidence(snapshot), snapshot };
}

function samePageArticle(requested: string, visible: string) {
  const requestedKey = normalizeArticleToken(requested);
  const visibleKey = normalizeArticleToken(visible);
  return requestedKey === visibleKey || /^\d{7}n5$/.test(requestedKey) && requestedKey === `${visibleKey}n5`;
}

export function applyAhlsellProductDetails<T extends AhlsellPublicCandidate>(candidate: T, detail?: AhlsellProductDetails | null): T {
  if (!detail || !samePageArticle(candidate.articleNumber, detail.articleNumber)) return candidate;
  // A validated N5 page alias establishes that both sources describe this NRF.
  const matchingEvidence = candidate.technicalEvidence && samePageArticle(candidate.articleNumber, candidate.technicalEvidence.articleNumber);
  const existing = matchingEvidence ? { ...candidate.technicalEvidence!, articleNumber: detail.articleNumber } : undefined;
  const identityWarnings = candidate.technicalEvidence && !matchingEvidence
    ? technicalEvidenceWarnings(candidate.articleNumber, candidate.technicalEvidence) : [];
  return { ...candidate, articleNumber: detail.articleNumber, subtitle: detail.subtitle ?? undefined,
    description: detail.subtitle ?? detail.description ?? candidate.description,
    specifications: [...new Set([...candidate.specifications, ...detail.specifications,
      ...(detail.subtitle ? [detail.subtitle] : []), ...(detail.description ? [detail.description] : [])])],
    technicalEvidence: mergeAhlsellTechnicalEvidence(existing, detail.technicalEvidence),
    ...(identityWarnings.length ? { matchWarnings: [...new Set([...(candidate.matchWarnings ?? []), ...identityWarnings])] } : {})
  };
}

/** Public product pages only; every redirect uses the same host/path checks. */
export async function fetchAhlsellProductPage({
  productUrl, articleNumber, fetchImpl = fetch, signal: externalSignal, reportFailures = false
}: {
  productUrl: string;
  articleNumber?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  reportFailures?: boolean;
}): Promise<{ html: string; url: string } | null> {
  const safeUrl = safeAhlsellProductUrl(productUrl, articleNumber);
  if (!safeUrl) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  let releaseOutboundSlot: (() => void) | undefined;
  try {
    releaseOutboundSlot = await acquireOutboundFetchSlot(controller.signal);
    let currentUrl = safeUrl;
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
        await response.body?.cancel();
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

      if (!response.ok) {
        if (reportFailures && response.status !== 404 && response.status !== 410) throw new Error(`Ahlsell svarade med HTTP ${response.status}.`);
        return null;
      }
      const contentType = response.headers.get("content-type")?.toLocaleLowerCase("en-US") ?? "";
      if (contentType && !contentType.includes("text/html")) {
        if (reportFailures) throw new Error("Ahlsell returnerade inte en produktsida.");
        return null;
      }
      const html = await readResponseTextWithinLimit(response, MAX_RESPONSE_BYTES);
      return html === null ? null : { html, url: currentUrl };
    }
  } finally {
    releaseOutboundSlot?.();
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

export function safeAhlsellProductUrl(value: unknown, articleNumber?: string) {
  const rawUrl = text(value, 2_000);
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    // Ahlsell's public article redirect still emits legacy /33/category/article
    // links. Resolve them to the canonical public product path before fetching.
    if (/^\/33\/(?:[^/]+\/)+\d{6,12}(?:---[^/]*)?\/?$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/^\/33\//, "/products/");
    }
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.port
      || !ALLOWED_AHLSELL_HOSTS.has(url.hostname.toLocaleLowerCase("en-US"))
      || !(url.pathname.toLocaleLowerCase("en-US").startsWith("/products/") || /^\/productVariantProxy\/\d{6,12}\/?$/i.test(url.pathname))
      || /%2f|%5c/i.test(url.pathname)
      || rawUrl.includes("\\")
      || (articleNumber !== undefined && !urlPathContainsArticleNumber(url.pathname, articleNumber))
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
