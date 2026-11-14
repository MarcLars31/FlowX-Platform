import { productPostMeasurement } from "./project-requirement-views";
import { requirementExtractionWarnings } from "./requirement-extraction-warnings";
import { currentPostRequirement } from "./current-post-requirement";
import { ownRequirementBody } from "./own-requirement-text";
import { projectRequirementKFactorDisplayValue } from "./project-requirement-data-warnings";

export type ProjectRequirementDetail = {
  sourceWarnings?: string[];
  sourceReimportReadings?: string[];
  sourceUnassignedReadings?: string[];
  postNumber: string | null;
  chapterPost: string | null;
  parentPostNumber: string | null;
  inheritedSpecification?: string | null;
  nsCode: string | null;
  system: string | null;
  standardRefs: string[];
  attributes: Array<[string, string]>;
  sourcePage: number | null;
  sourcePages?: number[];
  sourceExcerpt: string | null;
  additionalRequirements: string | null;
  chapterInformation?: boolean;
  sourceLayout?: "six-column";
  pdfColumnValues?: { unit: string; quantity: string };
};

export function projectRequirementDetails(
  requirement: Record<string, unknown>
): ProjectRequirementDetail {
  const chapterPost = text(record(record(requirement.value_json).attributes).kapittelpost);
  requirement = currentPostRequirement(requirement);
  const value = record(requirement.value_json);
  const sourceExcerpt =
    ownRequirementBody(value) ?? text(value.pdfDescriptionText) ?? text(value.technicalSpecification) ?? text(requirement.source_excerpt);
  const columnValues = record(value.pdfColumnValues);
  const requirementKey = text(requirement.requirement_key);
  const attributes = normalizedAttributes(record(value.attributes));
  const sourceKFactor = projectRequirementKFactorDisplayValue(requirement);
  if (sourceKFactor) attributes["k-faktor"] = sourceKFactor;

  const sourceWarnings = requirementExtractionWarnings(requirement, { includePostPlacement: false });
  const flags = Array.isArray(value.reviewFlags) ? value.reviewFlags : [];
  if (productPostMeasurement({ ...requirement, id: String(requirement.id ?? "") }).missingQuantity
    && !flags.includes("missing-quantity") && !flags.includes("unrecognized-quantity-columns")) {
    sourceWarnings.push("PDF-postens mängd saknas i läsningen och behöver kontrolleras.");
  }
  if (typeof columnValues.unit === "string" && columnValues.unit.trim() && !/[\p{L}]/u.test(columnValues.unit)) {
    sourceWarnings.push("PDF-postens enhet är oklar. Kontrollera enheten i original-PDF:n.");
  }
  return {
    sourceWarnings,
    sourceReimportReadings: stringList(value.sourceReimportReadings),
    sourceUnassignedReadings: stringList(value.sourceUnassignedReadings),
    postNumber: text(value.postNumber) ?? postNumberFromSource(sourceExcerpt),
    chapterPost,
    parentPostNumber: text(value.parentPostNumber),
    inheritedSpecification: text(value.inheritedSpecification),
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
    ...(Array.isArray(value.sourcePages) ? { sourcePages: value.sourcePages.map(positiveInteger).filter((page): page is number => page !== null) } : {}),
    sourceExcerpt,
    ...(text(value.pdfDescriptionText) ? { sourceLayout: "six-column" as const } : {}),
    ...(typeof columnValues.unit === "string" && typeof columnValues.quantity === "string"
      ? { pdfColumnValues: { unit: columnValues.unit, quantity: columnValues.quantity } } : {}),
    chapterInformation: value.chapterInformation === true || (Array.isArray(value.reviewFlags) && value.reviewFlags.includes("project-information")),
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

/** Display only pages evidenced by this post, never pages belonging to ancestors. */
export function projectRequirementPageLabel(details: ProjectRequirementDetail) {
  const pages = [...new Set([
    ...(details.sourcePage ? [details.sourcePage] : []),
    ...[...(details.sourceExcerpt ?? "").matchAll(/^FORTSETTELSE SIDE (\d+)$/gm)].map(match => Number(match[1]))
  ])].filter(page => Number.isInteger(page) && page > 0).sort((a, b) => a - b);
  if (!pages.length) return "PDF-grunnlag";
  if (pages.length === 1) return `Side ${pages[0]}`;
  return pages.every((page, index) => index === 0 || page === pages[index - 1] + 1)
    ? `Side ${pages[0]}–${pages.at(-1)}` : `Side ${pages.join(", ")}`;
}
