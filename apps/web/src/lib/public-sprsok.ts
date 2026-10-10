/** Only the former public Sprsok catalog fields may cross the server boundary. */
export const SPRSOK_PUBLIC_COLUMNS = [
  "id", "sin", "leverandor", "type", "utforelse", "k_verdi", "rti", "datablad"
] as const;

export type PublicSprsokProduct = {
  id: number;
  sin: string | null;
  leverandor: string | null;
  type: string | null;
  utforelse: string | null;
  k_verdi: string | null;
  rti: string | null;
  datablad: string | null;
};

export const SPRSOK_FILTERS = [
  { key: "leverandor", label: "Leverandør" },
  { key: "type", label: "Type" },
  { key: "utforelse", label: "Utførelse" },
  { key: "k_verdi", label: "K-verdi" },
  { key: "rti", label: "RTI" }
] as const;

export type SprsokFilterKey = (typeof SPRSOK_FILTERS)[number]["key"];
export type SprsokSortKey = "sin" | SprsokFilterKey;
export const SPRSOK_PAGE_SIZE = 50;

const collator = new Intl.Collator("nb", { numeric: true, sensitivity: "base" });
const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("nb").trim();
const compactArticle = (value: string) => normalize(value).replace(/[^\p{L}\p{N}]/gu, "");

/** The legacy import includes one literal spreadsheet heading row. */
export function isSprsokHeadingRow(row: PublicSprsokProduct) {
  return normalize(row.sin ?? "") === "sin"
    && normalize(row.leverandor ?? "") === "leverandør"
    && normalize(row.type ?? "") === "type"
    && normalize(row.utforelse ?? "") === "utførelse";
}

export function safeSprsokDatasheet(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function publicSprsokProduct(row: PublicSprsokProduct): PublicSprsokProduct {
  return {
    id: row.id, sin: row.sin, leverandor: row.leverandor, type: row.type,
    utforelse: row.utforelse, k_verdi: row.k_verdi, rti: row.rti,
    datablad: safeSprsokDatasheet(row.datablad)
  };
}

export function sprsokFilterOptions(products: readonly PublicSprsokProduct[], key: SprsokFilterKey) {
  return [...new Set(products.map(product => product[key]).filter((value): value is string => Boolean(value)))].sort(collator.compare);
}

export function searchPublicSprsok(products: readonly PublicSprsokProduct[], params: URLSearchParams) {
  const query = normalize((params.get("q") ?? "").slice(0, 200));
  const tokens = query.split(/\s+/).filter(Boolean);
  const article = compactArticle(query);
  const sortParam = params.get("sort");
  const sort: SprsokSortKey = SPRSOK_FILTERS.some(({ key }) => key === sortParam) ? sortParam as SprsokFilterKey : "sin";
  const direction = params.get("dir") === "desc" ? -1 : 1;

  return products.filter(product => {
    if (!SPRSOK_FILTERS.every(({ key }) => !params.get(key) || product[key] === params.get(key))) return false;
    if (!tokens.length) return true;
    const text = normalize([product.sin, ...SPRSOK_FILTERS.map(({ key }) => product[key])].join(" "));
    return tokens.every(token => text.includes(token)) || Boolean(article && compactArticle(product.sin ?? "").includes(article));
  }).sort((a, b) => direction * collator.compare(a[sort] ?? "", b[sort] ?? "") || collator.compare(a.sin ?? "", b.sin ?? "") || a.id - b.id);
}

export function sprsokPage(params: URLSearchParams, total: number) {
  const pages = Math.max(1, Math.ceil(total / SPRSOK_PAGE_SIZE));
  const requested = Number(params.get("page") ?? 1);
  return Math.max(1, Math.min(pages, Number.isSafeInteger(requested) ? requested : 1));
}
