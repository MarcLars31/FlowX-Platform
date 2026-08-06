import { normalizeArticleNumber } from "./sprsok-sync-core";

export function quotePostgrestValue(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function sprsokIlikeContains(value: string) {
  return `ilike.${quotePostgrestValue(`*${value}*`)}`;
}

export function buildSprsokSearchOr(columns: readonly string[], query: string, indexed: boolean) {
  const expressions = columns.map(
    (column) => `${column}.ilike.${quotePostgrestValue(`*${query}*`)}`
  );
  const normalizedArticle = normalizeArticleNumber(query);
  if (indexed && normalizedArticle) {
    expressions.push(
      `normalized_article_number.ilike.${quotePostgrestValue(`*${normalizedArticle}*`)}`
    );
  }
  return `(${expressions.join(",")})`;
}

export function isMissingSprsokSearchView(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /PGRST205|42P01|could not find (?:the )?(?:table|relation)|relation .* does not exist/i.test(
    message
  );
}
