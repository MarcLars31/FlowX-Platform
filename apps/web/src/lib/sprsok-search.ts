import { normalizeArticleNumber } from "./sprsok-sync-core";
import { catalogSearchTerms } from "./catalog-search";

export function quotePostgrestValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function sprsokIlikeContains(value: string) {
  return `ilike.*${sanitizePostgrestSearchValue(value)}*`;
}

/** Match a whole numeric value, including catalog dual notation, never a
 * substring: K80 must not match K800 or K80.5. */
export function sprsokExactNumberFilter(value: string) {
  const raw = value.trim().replace(/^k\s*/i, "");
  if (!/^\d+(?:[.,]\d+)?$/.test(raw)) return `ilike.${sanitizePostgrestSearchValue(value)}`;
  const normalized = String(Number(raw.replace(",", ".")));
  const pattern = normalized.includes(".") ? normalized.replace(".", "[.,]") + "0*" : normalized + "([.,]0+)?";
  // Top-level scalar filters take raw values. Quotes are only for values
  // embedded in logical expressions; here they become literal regex quotes.
  return `imatch.(^|[^0-9.,])${pattern}([^0-9.,]|$)`;
}

export function buildSprsokSearchOr(columns: readonly string[], query: string, indexed: boolean) {
  const terms = catalogSearchTerms(query).map(group => group.map(sanitizePostgrestSearchValue).filter(Boolean)).filter(group => group.length);
  if (!terms.length) return null;
  // The index's document includes product names as well as the visible columns.
  const fields = indexed ? [...columns, "search_document"] : columns;
  const groups = terms.map(group => `or(${fields.flatMap(column => group.map(term => `${column}.ilike.*${term}*`)).join(",")})`);
  const expressions = [groups.length > 1 ? `and(${groups.join(",")})` : groups[0]];
  const normalizedArticle = normalizeArticleNumber(query);
  if (indexed && normalizedArticle) {
    expressions.push(
      `normalized_article_number.ilike.*${sanitizePostgrestSearchValue(normalizedArticle)}*`
    );
  }
  return `(${expressions.join(",")})`;
}

function sanitizePostgrestSearchValue(value: string) {
  return value
    .replace(/[\\",()*%_\[\]{}]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

export function isMissingSprsokSearchView(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /PGRST205|42P01|could not find (?:the )?(?:table|relation)|relation .* does not exist/i.test(
    message
  );
}
