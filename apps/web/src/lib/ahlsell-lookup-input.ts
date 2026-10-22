/** Ahlsell article numbers are not restricted to seven-digit NRF numbers. */
export function ahlsellLookupArticleNumber(value: string): string | null {
  const number = value.trim().replace(/^(?:nrf\s*(?:[- ]?(?:nr|nummer))?|art(?:ikkel|ikel)?\s*(?:[- .]?(?:nr|nummer))?)\.?\s*:?\s*/i, "").replace(/[\s-]/g, "");
  return /^\d{6,12}$/.test(number) ? number : null;
}

export function isAutomaticAhlsellLookup(value: string) {
  return Boolean(ahlsellLookupArticleNumber(value))
    || /^(?:https:\/\/)?(?:www\.)?ahlsell\.(?:no|se)\/(?:(?:products|33)\/\S+|productVariantProxy\/\d{6,12}\/?(?:[?#].*)?)$/i.test(value.trim());
}
