type Row = Record<string, unknown>;

/** The technical import is authoritative when both document IDs are present. */
export function projectRequirementScope(row: Row) {
  const value = row.value_json as Row | null;
  return [row.source_technical_description_document_id ?? row.source_document_id ?? "", value?.postScope ?? ""];
}

export function projectPostIdentity(row: Row, number: unknown) {
  return JSON.stringify([...projectRequirementScope(row), number]);
}
