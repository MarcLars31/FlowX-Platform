/** Paginate the exact-article group before other matches across the entire
 * result set, not just within the first fetched page. */
export async function rankedProductSearchPage<T>(query: string, limit: number, offset: number,
  read: (group: "exact" | "other" | "all", limit: number, offset: number) => Promise<{ rows: T[]; total: number }>) {
  if (!query) return read("all", limit, offset);
  const exact = await read("exact", limit, offset);
  const remaining = limit - exact.rows.length;
  const other = await read("other", Math.max(1, remaining), Math.max(0, offset - exact.total));
  return { rows: [...exact.rows, ...other.rows.slice(0, remaining)], total: exact.total + other.total };
}
