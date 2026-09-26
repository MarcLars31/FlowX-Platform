import { projectRequirementKFactorDisplayValue } from "./project-requirement-data-warnings";

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
  additionalRequirements: string | null;
};

export function projectRequirementDetails(
  requirement: Record<string, unknown>
): ProjectRequirementDetail {
  const value = record(requirement.value_json);
  const sourceExcerpt =
    text(value.technicalSpecification) ?? text(requirement.source_excerpt);
  const requirementKey = text(requirement.requirement_key);
  const attributes = normalizedAttributes(record(value.attributes));
  const sourceKFactor = projectRequirementKFactorDisplayValue(requirement);
  if (sourceKFactor) attributes["k-faktor"] = sourceKFactor;

  return {
    postNumber: text(value.postNumber) ?? postNumberFromSource(sourceExcerpt),
    chapterPost: text(attributes.kapittelpost),
    parentPostNumber: text(value.parentPostNumber),
    nsCode:
      text(value.nsCode) ??
      (requirementKey && looksLikeNsCode(requirementKey) ? requirementKey : null),
    system: effectiveRequirementSystem(value, attributes, sourceExcerpt),
    standardRefs: stringList(value.standardRefs),
    attributes: Object.entries(attributes).flatMap(([key, rawValue]) => {
      if (key === "kapittelpost") return [];
      const valueText = displayValue(rawValue);
      return valueText ? [[key, valueText] as [string, string]] : [];
    }),
    sourcePage: positiveInteger(requirement.source_page),
    sourceExcerpt,
    additionalRequirements: additionalRequirementsFromSources(
      [text(value.technicalSpecification), text(value.sourceText), text(requirement.source_excerpt)],
      attributes
    )
  };
}

export function isAdditionalRequirementAttribute(key: string) {
  return /^(?:omfatter også|andre krav|andra krav)$/i.test(key.replace(/[_-]+/g, " ").trim());
}

function additionalRequirementsFromSources(
  sources: Array<string | null>,
  attributes: Record<string, unknown>
) {
  const blocks: string[] = [];
  const normalized = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  const add = (value: string) => {
    const content = value.trim();
    if (!content || blocks.some(block => normalized(block).includes(normalized(content)))) return;
    const contained = blocks.findIndex(block => normalized(content).includes(normalized(block)));
    if (contained >= 0) blocks[contained] = content;
    else blocks.push(content);
  };

  for (const source of sources) {
    // Inherited main-post requirements also apply, but a child's title and
    // ordinary attributes must not become part of its parent's final clause.
    for (const section of (source ?? "").split(/\n\s*UNDERPOST\s*\n/i)) {
      const lines = section.split(/\r?\n/).map(line => line.trim());
      const heading = /^(?:andre|andra)\s+krav\s*:?\s*(.*)$/i;
      let start = lines.findIndex(line => heading.test(line));
      if (start < 0) start = lines.findIndex(line => /^[a-z]\)\s+\S/i.test(line));
      if (start < 0) continue;
      add(lines.slice(start).map(line => line.replace(heading, "$1")).join("\n"));
    }
  }

  // Older saved posts may only contain the extracted field. Keep that text
  // without inventing lettered clauses that were not preserved in the source.
  for (const [key, value] of Object.entries(attributes)) {
    if (isAdditionalRequirementAttribute(key)) add(displayValue(value) ?? "");
  }
  return blocks.length ? blocks.join("\n\n").replace(/\n+(?=[a-z]\)\s)/gi, "\n\n") : null;
}

function effectiveRequirementSystem(
  value: Record<string, unknown>,
  attributes: Record<string, unknown>,
  sourceExcerpt: string | null
) {
  const materialText = [
    text(value.description),
    text(value.category),
    text(attributes.slokkemiddel),
    sourceExcerpt
  ].filter(Boolean).join("\n").toLocaleLowerCase();
  if (/h[åa]ndsl[ou]kker|h[åa]ndslukkeapparat|brannsl[ou]kker/.test(materialText)) {
    return /\bskum\b|\bfoam\b/.test(materialText)
      ? "foam-extinguisher"
      : "portable-fire-extinguisher";
  }
  return text(value.system);
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

export function projectRequirementSystemLabel(value: string) {
  return {
    "foam-extinguisher": "Skumsläckare",
    "portable-fire-extinguisher": "Handbrandsläckare",
    "inert-gas": "Inertgassläcksystem",
    "dry-fire-main": "Torrt brandvattensystem",
    sprinkler: "Sprinkler"
  }[value] ?? specificationLabel(value);
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
