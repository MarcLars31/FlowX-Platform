import { buildSupabaseHeaders } from './supabase-headers';
import { offerCatalogObjectPath, parseAhlsellOfferCatalog } from './ahlsell-offer-catalog';

/** Only call with the organization resolved by the authenticated project guard.
 * The private bucket has no client read policy. Service credentials stay server-side. */
export async function readAhlsellOfferCatalog(config: {url: string; key: string}, organizationId: string, fetchImpl: typeof fetch = fetch) {
  const path = offerCatalogObjectPath(organizationId);
  const url = new URL(`storage/v1/object/product-documents/${path}`, config.url.replace(/\/?$/, '/'));
  try {
    const response = await fetchImpl(url, {headers: buildSupabaseHeaders(config.key), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(3000)});
    if (!response.ok) { await response.body?.cancel(); return {catalog: null, status: response.status === 404 ? 'empty' as const : 'unavailable' as const}; }
    const reader = response.body?.getReader();
    if (!reader) return {catalog: null, status: 'unavailable' as const};
    let bytes = 0; let text = ''; const decoder = new TextDecoder();
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 6_000_000) {await reader.cancel(); return {catalog: null, status: 'unavailable' as const};}
        text += decoder.decode(chunk.value, {stream: true});
      }
      const catalog = parseAhlsellOfferCatalog(JSON.parse(text + decoder.decode()), organizationId);
      return {catalog, status: catalog ? 'available' as const : 'unavailable' as const};
    } finally { reader.releaseLock(); }
  } catch { return {catalog: null, status: 'unavailable' as const}; }
}
