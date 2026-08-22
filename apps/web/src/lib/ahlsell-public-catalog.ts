import type { AhlsellPublicCandidate } from "@/lib/ahlsell-public-match";

export type AhlsellMarket = "no" | "se";

export type AhlsellCatalogResult = {
  query: string;
  queries: string[];
  searchUrl: string;
  searchUrls: string[];
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
  code?: unknown;
  numberOfVariants?: unknown;
};

type AhlsellVariantPayload = {
  settings?: unknown;
  items?: unknown;
};

const MARKET_ORIGINS: Record<AhlsellMarket, string> = {
  no: "https://www.ahlsell.no",
  se: "https://www.ahlsell.se"
};

const MAX_PAGES = 6;
const DEFAULT_MAX_CANDIDATES = 300;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_SEARCH_QUERIES = 3;
const MAX_VARIANT_FAMILIES = 8;

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
    queries: [cleanQuery],
    searchUrl: searchUrl.toString(),
    searchUrls: [searchUrl.toString()],
    total: Math.max(total, candidates.length),
    candidates,
    truncated: total > candidates.length
  };
}

export async function searchAhlsellPublicCatalogQueries({
  market,
  queries,
  fetchImpl = fetch,
  maxCandidates = 80,
  maxVariantFamilies = MAX_VARIANT_FAMILIES
}: {
  market: AhlsellMarket;
  queries: string[];
  fetchImpl?: typeof fetch;
  maxCandidates?: number;
  maxVariantFamilies?: number;
}): Promise<AhlsellCatalogResult> {
  const cleanQueries = [...new Set(
    queries
      .map((query) => query.replace(/\s+/g, " ").trim().slice(0, 180))
      .filter(Boolean)
  )].slice(0, MAX_SEARCH_QUERIES);
  if (cleanQueries.length === 0) throw new AhlsellCatalogError("Ahlsell-sökningen saknar sökord.");

  const byArticleNumber = new Map<string, AhlsellPublicCandidate>();
  const results: AhlsellCatalogResult[] = [];
  for (const query of cleanQueries) {
    const result = await searchAhlsellPublicCatalog({ market, query, fetchImpl, maxCandidates });
    results.push(result);
    for (const candidate of result.candidates) {
      if (!byArticleNumber.has(candidate.articleNumber)) byArticleNumber.set(candidate.articleNumber, candidate);
    }
  }

  const candidates = await enrichAhlsellVariants(
    [...byArticleNumber.values()],
    cleanQueries.join(" "),
    market,
    fetchImpl,
    maxVariantFamilies
  );
  const searchUrls = results.map((result) => result.searchUrl);
  return {
    query: cleanQueries[0],
    queries: cleanQueries,
    searchUrl: searchUrls[0],
    searchUrls,
    total: results.reduce((sum, result) => sum + result.total, 0),
    candidates,
    truncated: results.some((result) => result.truncated)
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
    source: "catalog_search",
    familyCode: text(card.code) ?? undefined,
    variantCount: finiteInteger(card.numberOfVariants) ?? undefined
  };
}

async function enrichAhlsellVariants(
  candidates: AhlsellPublicCandidate[],
  query: string,
  market: AhlsellMarket,
  fetchImpl: typeof fetch,
  maxVariantFamilies: number
) {
  const origin = MARKET_ORIGINS[market];
  const enrichable = candidates
    .filter((candidate) => candidate.familyCode && (candidate.variantCount ?? 0) > 1)
    .slice(0, Math.min(Math.max(Math.floor(maxVariantFamilies), 0), MAX_VARIANT_FAMILIES));
  if (enrichable.length === 0) return candidates;

  const replacements = new Map<string, AhlsellPublicCandidate>();
  await Promise.all(enrichable.map(async (candidate) => {
    const enriched = await fetchBestVariant(fetchImpl, origin, candidate, query).catch(() => null);
    if (enriched) replacements.set(candidate.articleNumber, enriched);
  }));
  return candidates.map((candidate) => replacements.get(candidate.articleNumber) ?? candidate);
}

async function fetchBestVariant(
  fetchImpl: typeof fetch,
  origin: string,
  candidate: AhlsellPublicCandidate,
  query: string
) {
  if (!candidate.familyCode) return null;
  const url = new URL("/api/search/variants", origin);
  url.searchParams.set("productCode", candidate.familyCode);
  url.searchParams.set("activeVariantNumber", candidate.articleNumber);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": origin.endsWith(".no") ? "no,en;q=0.8" : "sv,en;q=0.8",
        "User-Agent": "Scipx-Ahlsell-Public-Catalog/1.1 (+https://www.scipx.ai)"
      },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok || !(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return null;
    const payload = await response.json().catch(() => null) as AhlsellVariantPayload | null;
    if (!payload || !isRecord(payload.settings) || !Array.isArray(payload.items)) return null;
    const headers = isRecord(payload.settings.headers) ? payload.settings.headers : {};
    const variants = payload.items
      .map((item) => parseVariant(item, headers, origin))
      .filter((item): item is ParsedVariant => item !== null);
    if (variants.length === 0) return null;
    const best = variants.sort((left, right) => variantMatchScore(right, query) - variantMatchScore(left, query))[0];
    return {
      ...candidate,
      articleNumber: best.articleNumber,
      productName: best.productName || candidate.productName,
      productUrl: best.productUrl,
      imageUrl: best.imageUrl ?? candidate.imageUrl,
      specifications: [...new Set([...candidate.specifications, ...best.specifications])]
    } satisfies AhlsellPublicCandidate;
  } finally {
    clearTimeout(timeout);
  }
}

type ParsedVariant = {
  articleNumber: string;
  productName: string;
  productUrl: string;
  imageUrl?: string;
  specifications: string[];
  attributes: Map<string, string>;
  active: boolean;
  buyable: boolean;
};

function parseVariant(value: unknown, headers: Record<string, unknown>, origin: string): ParsedVariant | null {
  if (!isRecord(value)) return null;
  const articleNumber = text(value.code);
  const relativeUrl = text(value.url);
  if (!articleNumber || !relativeUrl) return null;
  const productUrl = safeAhlsellUrl(relativeUrl, origin);
  if (!productUrl) return null;
  const rawAttributes = isRecord(value.attributes) ? value.attributes : {};
  const attributes = new Map<string, string>();
  const specifications: string[] = [];
  for (const [key, rawAttribute] of Object.entries(rawAttributes)) {
    if (!isRecord(rawAttribute)) continue;
    const label = text(headers[key]);
    const rawValue = text(rawAttribute.value);
    if (!label || !rawValue) continue;
    const unit = text(rawAttribute.unit);
    const displayValue = `${rawValue}${unit ? ` ${unit}` : ""}`;
    attributes.set(normalize(label), normalize(displayValue));
    specifications.push(`${label}: ${displayValue}`);
  }
  const image = isRecord(value.image) ? text(value.image.url) : null;
  return {
    articleNumber,
    productName: text(value.productName) ?? "",
    productUrl,
    imageUrl: image ? safeAhlsellUrl(image, origin) ?? undefined : undefined,
    specifications,
    attributes,
    active: value.isActiveVariant === true,
    buyable: value.buyable === true
  };
}

function variantMatchScore(variant: ParsedVariant, query: string) {
  const normalizedQuery = normalize(query);
  let score = (variant.active ? 2 : 0) + (variant.buyable ? 1 : -20);
  const kFactor = normalizedQuery.match(/\bk\s*-?\s*(\d+(?:[.,]\d+)?)\b/)?.[1];
  const temperature = normalizedQuery.match(/\b(57|68|79|93|100|121|141|182|260)\b/)?.[1];
  const response = /\b(?:sr|standard)\b/.test(normalizedQuery)
    ? "standard"
    : /\b(?:qr|quick|kvikk)\b/.test(normalizedQuery) ? "quick" : null;
  const color = normalizedQuery.match(/\b(hvit|vit|white|messing|massing|brass|krom|chrome|sort|svart|black)\b/)?.[1] ?? null;
  score += attributeScore(variant.attributes, "k faktor", kFactor, 30, -100);
  score += attributeScore(variant.attributes, "responstemperatur", temperature, 25, -80);
  score += attributeScore(variant.attributes, "responstid", response, 20, -60);
  score += attributeScore(variant.attributes, "farge", color, 15, -25);
  return score;
}

function attributeScore(
  attributes: Map<string, string>,
  label: string,
  expected: string | null | undefined,
  match: number,
  mismatch: number
) {
  if (!expected) return 0;
  const actual = [...attributes].find(([key]) => key.includes(label))?.[1];
  if (!actual) return 0;
  const normalizedExpected = normalize(expected);
  const aliases = normalizedExpected === "quick" ? ["quick", "kvikk"]
    : normalizedExpected === "standard" ? ["standard"]
      : normalizedExpected === "white" || normalizedExpected === "vit" ? ["hvit", "vit", "white"]
        : normalizedExpected === "brass" || normalizedExpected === "massing" ? ["messing", "massing", "brass"]
          : [normalizedExpected];
  return aliases.some((alias) => actual.includes(alias)) ? match : mismatch;
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

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.,]+/g, " ")
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
