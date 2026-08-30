import "server-only";
import { selectAllUserRows } from "@/lib/supabase-user-rest";
import type { SprsokTechnicalRow } from "@/lib/sprsok-technical-match";

const CACHE_TTL_MS = 5 * 60_000;
const MAX_VISIBLE_PRODUCTS = 2_000;

let catalogCache: {
  expiresAt: number;
  promise: Promise<SprsokTechnicalRow[]>;
} | null = null;

export async function loadSprsokTechnicalCatalog() {
  const now = Date.now();
  if (catalogCache && catalogCache.expiresAt > now) return catalogCache.promise;

  const promise = selectAllUserRows<SprsokTechnicalRow>(
    "sprsok_product_search",
    {
      select: "id,sin,leverandor,type,utforelse,k_verdi,rti,datablad",
      order: "id.asc"
    },
    {
      pageSize: 500,
      maxRows: MAX_VISIBLE_PRODUCTS
    }
  );
  catalogCache = { expiresAt: now + CACHE_TTL_MS, promise };

  try {
    return await promise;
  } catch (error) {
    if (catalogCache?.promise === promise) catalogCache = null;
    throw error;
  }
}
