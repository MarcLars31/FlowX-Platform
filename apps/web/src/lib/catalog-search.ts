/** Shared text semantics for the public catalog and database search. */
export function normalizeCatalogText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("nb").replace(/\s+/g, " ").trim();
}

export function compactCatalogArticle(value: string) {
  return normalizeCatalogText(value).replace(/[^\p{L}\p{N}]/gu, "");
}

const aliases = [
  ["pendent", "pendant", "hängande", "hengende"],
  ["upright", "stående", "staende"],
  ["qr", "quick response", "snabb respons", "rask respons", "kvikk respons"],
  ["sr", "standard response", "standard respons"]
];

/** Technical phrases stay together; each group must match, within any field. */
export function catalogSearchTerms(query: string): string[][] {
  let text = normalizeCatalogText(query.slice(0, 200));
  for (const group of aliases) {
    for (const phrase of [...group].sort((a, b) => b.length - a.length)) {
      text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${phrase}(?![\\p{L}\\p{N}])`, "gu"), group[0]);
    }
  }
  return [...new Set(text.split(/\s+/).filter(Boolean))]
    .map(token => aliases.find(group => group[0] === token) ?? [token]);
}

export function matchesCatalogSearch(fields: readonly (string | null | undefined)[], articleNumber: string | null, query: string) {
  const text = normalizeCatalogText(fields.filter(Boolean).join(" "));
  const terms = catalogSearchTerms(query);
  const article = compactCatalogArticle(query);
  return !terms.length || terms.every(group => group.some(term => text.includes(term)))
    || Boolean(article && compactCatalogArticle(articleNumber ?? "").includes(article));
}

export function exactCatalogArticle(articleNumber: string | null, query: string) {
  const article = compactCatalogArticle(query);
  return Boolean(article && compactCatalogArticle(articleNumber ?? "") === article);
}
