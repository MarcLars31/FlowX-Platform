type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};

/** Only exact duplicates become local references. Different inherited specifications
 * and manually corrected text remain independent, as do extraction audit records. */
export function compactRequirementText<T extends Row>(row: T, candidate = false): T {
  const jsonKey = candidate ? "normalized_value" : "value_json";
  const sourceKey = candidate ? "raw_text" : "source_excerpt";
  const source = row[sourceKey];
  if (typeof source !== "string" || !source) return row;
  const value = { ...object(row[jsonKey]) };
  const prior = object(value.textStorage);
  const references = prior.version === 1 ? { ...object(prior.references) } : {};
  for (const key of ["sourceText", "technicalSpecification"]) {
    if (value[key] === source) { delete value[key]; references[key] = sourceKey; }
    else if (Object.hasOwn(value, key)) delete references[key];
  }
  if (!Object.keys(references).length) { delete value.textStorage; }
  else value.textStorage = { version: 1, references };
  return { ...row, [jsonKey]: value };
}

export function expandRequirementText<T extends Row>(row: T, candidate = false): T {
  const jsonKey = candidate ? "normalized_value" : "value_json";
  const sourceKey = candidate ? "raw_text" : "source_excerpt";
  const value = object(row[jsonKey]);
  const storage = object(value.textStorage);
  if (storage.version !== 1 || typeof row[sourceKey] !== "string") return row;
  const expanded = { ...value };
  for (const key of ["sourceText", "technicalSpecification"]) {
    if (!Object.hasOwn(expanded, key) && object(storage.references)[key] === sourceKey) expanded[key] = row[sourceKey];
  }
  delete expanded.textStorage;
  return { ...row, [jsonKey]: expanded };
}
