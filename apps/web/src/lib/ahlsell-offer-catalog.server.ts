import 'server-only';
import { getSupabaseConfig } from './supabase-rest';
import { readAhlsellOfferCatalog } from './ahlsell-offer-storage';

const cache = new Map<string, {expires: number; result: Awaited<ReturnType<typeof readAhlsellOfferCatalog>>}>();
export async function organizationAhlsellOfferCatalog(organizationId: string) {
  const cached = cache.get(organizationId);
  if (cached && cached.expires > Date.now()) return cached.result;
  try {
    const result = await readAhlsellOfferCatalog(getSupabaseConfig(), organizationId);
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(organizationId, {expires: Date.now() + (result.status === 'unavailable' ? 5000 : 60000), result});
    return result;
  } catch { return {catalog: null, status: 'unavailable' as const}; }
}
