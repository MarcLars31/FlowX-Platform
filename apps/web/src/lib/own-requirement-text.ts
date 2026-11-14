type Value = Record<string, unknown>;
const record = (v: unknown): Value => v && typeof v === "object" && !Array.isArray(v) ? v as Value : {};

/** The verified heading split is the shared own-text model for display and
 * product checks. Keep original source/specification fields for provenance. */
export function ownRequirementBody(value: Value): string | undefined {
  const split = record(value.headingSplit);
  return split.version === 1 && ["separated", "review"].includes(String(split.status))
    && typeof split.requirementText === "string" ? split.requirementText : undefined;
}

export function ownRequirementSpecification(value: Value): string | undefined {
  const split = record(value.headingSplit);
  const body = split.version === 1 && split.status === "heading-only" ? "" : ownRequirementBody(value);
  if (body === undefined) return undefined;
  if (split.status === "review") return body || undefined;
  return [split.title, body].filter(v => typeof v === "string" && v.trim()).join("\n");
}
