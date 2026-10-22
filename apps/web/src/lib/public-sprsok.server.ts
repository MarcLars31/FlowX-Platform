import "server-only";
import { unstable_cache } from "next/cache";
import { selectSupabaseRows } from "./supabase-rest";
import { SPRSOK_PUBLIC_COLUMNS, isSprsokHeadingRow, publicSprsokProduct, type PublicSprsokProduct } from "./public-sprsok";

export async function readPublicSprsokCatalog(
  select: typeof selectSupabaseRows = selectSupabaseRows
): Promise<PublicSprsokProduct[]> {
  const products: PublicSprsokProduct[] = [];
  // Use the published Sprsok view exclusively. It omits hidden source records
  // and never joins customer data, internal products or demo catalogs.
  for (let offset = 0; ; offset += 500) {
    const rows = await select<PublicSprsokProduct>("sprsok_product_search", {
      select: SPRSOK_PUBLIC_COLUMNS.join(","),
      order: "id.asc",
      limit: "500",
      offset: String(offset)
    });
    products.push(...rows.filter(row => !isSprsokHeadingRow(row)).map(publicSprsokProduct));
    if (rows.length < 500) return products;
  }
}

export const getPublicSprsokCatalog = unstable_cache(
  () => readPublicSprsokCatalog(),
  ["public-sprsok-catalog-v2"],
  { revalidate: 300, tags: ["public-sprsok-catalog"] }
);
