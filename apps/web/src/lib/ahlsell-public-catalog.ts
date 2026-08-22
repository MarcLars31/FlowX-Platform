import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

export type AhlsellMarket = "no" | "se";

export type AhlsellCatalogResult = {
  query: string;
  searchUrl: string;
  total: number;
  candidates: AhlsellPublicCandidate[];
  truncated: boolean;
};

type AhlsellSearchPayload = {
  productCount?: unknown;
  productCards?: unknown;
};

type AhlsellProductCard = {
  name?: unknown;
  description?: unknown;
  firstVariationPageUrl?: unknown;
  mostRelevantVariantId?: unknown;
  variantNumber?: unknown;
  brand?: unknown;
  image?: unknown;
};

const MARKET_ORIGINS: Record<AhlsellMarket, string> = {
  no: "https://www.ahlsell.no",
  se: "https://www.ahlsell.se"
};

const MAX_PAGES = 6;
const DEFAULT_MAX_CANDIDATES = 300;
const REQUEST_TIMEOUT_MS = 8_000;

export class AhlsellCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AhlsellCatalogError";
  }
}

export async function searchAhlsellPublicCatalog({
  market,
  query,
  fetchImpl = fetch,
  maxCandidates = DEFAULT_MAX_CANDIDATES
}: {
  market: AhlsellMarket;
  query: string;
  fetchImpl?: typeof fetch;
  maxCandidates?: number;
}): Promise<AhlsellCatalogResult> {
  const cleanQuery = query.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!cleanQuery) throw new AhlsellCatalogError("Ahlsell-sökningen saknar sökord.");

  const origin = MARKET_ORIGINS[market];
  const safeMaxCandidates = Math.min(Math.max(Math.floor(maxCandidates), 1), DEFAULT_MAX_CANDIDATES);
  const byArticleNumber = new Map<string, AhlsellPublicCandidate>();
  let total = 0;

  for (let page = 1; page <= MAX_PAGES && byArticleNumber.size < safeMaxCandidates; page += 1) {
    const payload = await fetchAhlsellPage(fetchImpl, origin, cleanQuery, page);
    const cards = Array.isArray(payload.productCards) ? payload.productCards : [];
    const parsedTotal = finiteInteger(payload.productCount);
    if (parsedTotal !== null) total = Math.max(total, parsedTotal);

    for (const card of cards) {
      const candidate = parseAhlsellProductCard(card, origin);
      if (!candidate || byArticleNumber.has(candidate.articleNumber)) continue;
      byArticleNumber.set(candidate.articleNumber, candidate);
      if (byArticleNumber.size >= safeMaxCandidates) break;
    }

    if (cards.length === 0 || byArticleNumber.size >= total) break;
  }

  const candidates = [...byArticleNumber.values()];
  const searchUrl = new URL("/search", origin);
  searchUrl.searchParams.set("parameters.SearchPhrase", cleanQuery);

  return {
    query: cleanQuery,
    searchUrl: searchUrl.toString(),
    total: Math.max(total, candidates.length),
    candidates,
    truncated: total > candidates.length
  };
}

export function ahlsellMarketFromSearchUrl(searchUrl: string): AhlsellMarket {
  try {
    const hostname = new URL(searchUrl).hostname.toLowerCase();
    return hostname === "www.ahlsell.se" || hostname === "ahlsell.se" ? "se" : "no";
  } catch {
    return "no";
  }
}

async function fetchAhlsellPage(
  fetchImpl: typeof fetch,
  origin: string,
  query: string,
  page: number
): Promise<AhlsellSearchPayload> {
  const url = new URL("/api/search", origin);
  url.searchParams.set("parameters.SearchPhrase", query);
  if (page > 1) url.searchParams.set("parameters.page", String(page));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": origin.endsWith(".no") ? "no,en;q=0.8" : "sv,en;q=0.8",
        "User-Agent": "Scipx-Ahlsell-Public-Catalog/1.0 (+https://www.scipx.ai)"
      },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new AhlsellCatalogError(`Ahlsell svarade med HTTP ${response.status}.`);
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      throw new AhlsellCatalogError("Ahlsell returnerade inte produktdata.");
    }
    const payload = await response.json().catch(() => null);
    if (!isRecord(payload)) throw new AhlsellCatalogError("Ahlsells produktsvar kunde inte läsas.");
    return payload;
  } catch (error) {
    if (error instanceof AhlsellCatalogError) throw error;
    throw new AhlsellCatalogError(
      error instanceof Error && error.name === "AbortError"
        ? "Ahlsells produktsökning tog för lång tid."
        : "Ahlsells produktsökning kunde inte nås."
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseAhlsellProductCard(value: unknown, origin: string): AhlsellPublicCandidate | null {
  if (!isRecord(value)) return null;
  const card = value as AhlsellProductCard;
  const articleNumber = text(card.mostRelevantVariantId) ?? text(card.variantNumber);
  const productName = text(card.name);
  const relativeProductUrl = text(card.firstVariationPageUrl);
  if (!articleNumber || !productName || !relativeProductUrl) return null;

  const manufacturer = text(card.brand) ?? "";
  const description = stripMarkup(text(card.description) ?? "").slice(0, 2_000);
  const image = isRecord(card.image) ? text(card.image.url) : null;
  const productUrl = safeAhlsellUrl(relativeProductUrl, origin);
  if (!productUrl) return null;

  return {
    articleNumber,
    productName,
    manufacturer,
    productUrl,
    description: description || undefined,
    imageUrl: image ? safeAhlsellUrl(image, origin) ?? undefined : undefined,
    specifications: manufacturer ? [`Tillverkare: ${manufacturer}`] : [],
    source: "catalog_search"
  };
}

function safeAhlsellUrl(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.toString() : null;
  } catch {
    return null;
  }
}

function stripMarkup(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function finiteInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
