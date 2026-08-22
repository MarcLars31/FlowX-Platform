export type ProjectRequirementDetail = {
  postNumber: string | null;
  chapterPost: string | null;
  parentPostNumber: string | null;
  nsCode: string | null;
  system: string | null;
  standardRefs: string[];
  attributes: Array<[string, string]>;
  sourcePage: number | null;
  sourceExcerpt: string | null;
};

export function projectRequirementDetails(
  requirement: Record<string, unknown>
): ProjectRequirementDetail {
  const value = record(requirement.value_json);
  const sourceExcerpt =
    text(value.technicalSpecification) ?? text(requirement.source_excerpt);
  const requirementKey = text(requirement.requirement_key);
  const attributes = normalizedAttributes(record(value.attributes));

  return {
    postNumber: text(value.postNumber) ?? postNumberFromSource(sourceExcerpt),
    chapterPost: text(attributes.kapittelpost),
    parentPostNumber: text(value.parentPostNumber),
    nsCode:
      text(value.nsCode) ??
      (requirementKey && looksLikeNsCode(requirementKey) ? requirementKey : null),
    system: text(value.system),
    standardRefs: stringList(value.standardRefs),
    attributes: Object.entries(attributes).flatMap(([key, rawValue]) => {
      if (key === "kapittelpost") return [];
      const valueText = displayValue(rawValue);
      return valueText ? [[key, valueText] as [string, string]] : [];
    }),
    sourcePage: positiveInteger(requirement.source_page),
    sourceExcerpt
  };
}

export function postNumberFromSource(sourceExcerpt: string | null) {
  if (!sourceExcerpt) return null;
  const splitMatch = sourceExcerpt.match(
    /^\s*(\d+(?:\.\d+){2,})\.\s*\r?\n\s*(\d+(?:\.\d+)*)\b/m
  );
  if (splitMatch) return `${splitMatch[1]}.${splitMatch[2]}`;

  return sourceExcerpt.match(/^\s*(\d+(?:\.\d+){3,})\b/m)?.[1] ?? null;
}

export function specificationLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\bdn\b/gi, "DN")
    .replace(/\bnfpa\b/gi, "NFPA")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("sv-SE"));
}

function looksLikeNsCode(value: string) {
  return /^%?[A-ZÆØÅ]{1,5}[A-ZÆØÅ0-9]*\.[A-ZÆØÅ0-9.]+$/i.test(value);
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.flatMap((item) => (text(item) ? [text(item)!] : [])))]
    : [];
}

function displayValue(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const values = value.flatMap((item) => (text(item) ? [text(item)!] : []));
    return values.length ? values.join(", ") : null;
  }
  return null;
}

function normalizedAttributes(attributes: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attributes)) {
    const normalizedKey = key.toLocaleLowerCase() === "dimension" ? "dimensjon" : key;
    output[normalizedKey] = value;
  }
  return output;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
