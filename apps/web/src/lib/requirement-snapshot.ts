export const REQUIREMENT_SNAPSHOT_VERSION = 1;

/** Saved extraction is the source of truth. Reads never re-extract a PDF. A
 * legacy row remains revision 0 until an explicit, audited re-extraction. */
export function requirementSnapshot<T extends Record<string, unknown>>(row: T): T {
  const value = row.value_json && typeof row.value_json === "object" && !Array.isArray(row.value_json)
    ? row.value_json as Record<string, unknown> : {};
  return { ...row, value_json: { ...value,
    extractionVersion: value.extractionVersion ?? 0,
    sourceText: value.sourceText ?? row.source_excerpt ?? value.technicalSpecification ?? ""
  } };
}
