type Row = Record<string, unknown> & { id?: string };
type Store = {
  selectUserRows<T>(table: string, filters: Record<string, string>): Promise<T[]>;
  updateUserRowsReturning<T>(table: string, filters: Record<string, string>, changes: Record<string, unknown>): Promise<T>;
};
const column = (table: string) => table === "project_requirements" ? "value_json"
  : table === "requirement_candidates" ? "normalized_value" : table === "technical_description_material_lines" ? "review_flags" : null;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const flags = (value: unknown) => Array.isArray(value) ? value.filter((flag): flag is string => typeof flag === "string") : [];
const warnings = (values: string[]) => values.filter(flag => flag !== "project-information");

export function importReviewFlagSelect(table: string) {
  const field = column(table);
  return field ? `id,source_review_flags:${field}${field === "review_flags" ? "" : "->reviewFlags"}` : "id";
}

/** Add source warnings only. A re-import cannot overwrite saved text, amounts,
 * review decisions or selections. Read raw JSON under an alias to avoid read
 * projections, and retry optimistic writes against the latest saved revision. */
export async function refreshImportedReviewFlags(table: string, scope: Record<string, string>, incoming: Row[], existing: Row[], db: Store) {
  const field = column(table);
  if (!field) return;
  const heads = new Map(existing.map(row => [row.id, row]));
  const rowFlags = (row: Row) => flags(field === "review_flags" ? row[field] : record(row[field]).reviewFlags);
  for (const row of incoming) {
    const head = heads.get(row.id);
    if (!head) continue;
    const wanted = warnings(rowFlags(row));
    const known = flags(head.source_review_flags ?? (field === "review_flags" ? head[field] : record(head[field]).reviewFlags));
    if (wanted.every(flag => known.includes(flag))) continue;
    let complete = false;
    for (let attempt = 0; attempt < 3 && !complete; attempt++) {
      const [current] = await db.selectUserRows<Row>(table, { ...scope, id: `eq.${row.id}`, select: `id,updated_at,stored_value:${field}` });
      if (!current) throw new Error("PDF source warning target disappeared during import.");
      const stored = current.stored_value ?? current[field];
      const prior = flags(field === "review_flags" ? stored : record(stored).reviewFlags);
      const combined = [...new Set([...prior, ...wanted])];
      if (combined.length === prior.length) { complete = true; break; }
      try {
        await db.updateUserRowsReturning(table, { ...scope, id: `eq.${row.id}`,
          ...(typeof current.updated_at === "string" ? { updated_at: `eq.${current.updated_at}` } : {}) },
        { [field]: field === "review_flags" ? combined : { ...record(stored), reviewFlags: combined } });
        complete = true;
      } catch (error) {
        if (!(error instanceof Error) || !/returned no row/.test(error.message)) throw error;
      }
    }
    if (!complete) throw new Error("PDF source warnings could not be saved because the post was edited concurrently. Retry the import.");
  }
}
