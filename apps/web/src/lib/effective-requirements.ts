import { currentPostRequirement } from "./current-post-requirement";
import { productRequirementAttributes } from "./ahlsell-requirement-context";
import { canonicalProperty, normalizeRequirementValue, technicalRevision, technicalText, type EffectiveRequirement, type EffectiveRequirementSet, type RequirementSource, type RequirementOperator } from "./technical-evaluation-model";

type Row = Record<string, unknown>;
const informational = /^(?:kapittel|kapittelpost|lokalisering|mengde|antall|quantity|unit|enhet|postnummer|ns kode|pdf kommentar)$/;
const quantityLine = /^(?:(?:antall|mengde)\s+(?:stk?|stk\.|st\.|pcs)|(?:lengde\s+)?m|(?:antall\s+)?stk?|rund\s+sum\s+rs)\s*(?:\d+(?:[.,]\d+)?)?$/i;
const freeChoice = /^(?:valgfritt|valfritt|optional|ikke relevant|ej relevant|none|ingen|nei|nej)\.?$/i;

/** Resolve only supplied evidence. No inference of chapter requirements from an NS code. */
export function resolveEffectiveRequirements(requirement: Row): EffectiveRequirementSet {
  requirement = currentPostRequirement(requirement);
  const value = record(requirement.value_json);
  const origins = record(value.attributeSources);
  const requirements: EffectiveRequirement[] = [];
  const postNumber = string(value.postNumber);
  const documentId = string(requirement.source_technical_description_document_id ?? requirement.source_document_id);
  const ownSource = (raw: string): RequirementSource => ({ kind: "post", postNumber, documentId, page: page(requirement.source_page), raw });
  const add = (label: string, raw: unknown, source: RequirementSource, mandatory = true, explicitOperator?: RequirementOperator) => {
    if (raw === null || raw === undefined || raw === "") return;
    const text = typeof raw === "string" ? raw.trim() : JSON.stringify(raw);
    if (informational.test(technicalText(label))) return;
    // An explicit absence (false/"none") is meaningful. Only "free choice" removes a constraint.
    if (/^(?:valgfritt|valgfri|valfritt|valfri|optional)\.?$/i.test(text)) return;
    let property = canonicalProperty(label);
    if (property === "workingPressureBar" && /^(?:(?:minimum|minst|>=|≥)\s*)?PN\s*\d/i.test(text)) property = "pn";
    if (!property && /^(?:dimensjon|dimension|dimensjonerende dimensjon)$/.test(technicalText(label)) && /^DN\s*\d/i.test(text)) property = "dn";
    const minimum = /^(?:>=|≥|minimum|min\.?|minst)\s*/i;
    const maximum = /^(?:<=|≤|maksimum|maks\.?|max\.?|maximum|hogst)\s*/i;
    const operator = explicitOperator ?? (minimum.test(text) ? "gte" : maximum.test(text) ? "lte" : property === "workingPressureBar" ? "gte" : property === "standard" || property === "approval" ? "contains" : "eq");
    const input = text.replace(minimum, "").replace(maximum, "");
    const alternatives = input.split(/\s+(?:eller|or)\s+/i);
    const parsed = property ? (alternatives.length > 1 ? alternatives.map(item => normalizeRequirementValue(property!, item)) : [normalizeRequirementValue(property, typeof raw === "string" ? input : raw)]) : [];
    const valid = parsed.length > 0 && parsed.every(item => item !== null) && new Set(parsed.map(item => item?.unit)).size === 1;
    const normalizedValue = valid ? parsed.length > 1 ? parsed.map(item => item!.value) : parsed[0]!.value : null;
    const entry: EffectiveRequirement = {
      id: "", property: property ?? `unresolved:${technicalText(label)}`, label,
      operator: parsed.length > 1 && !explicitOperator ? "one_of" : operator,
      value: normalizedValue, ...(parsed[0]?.unit ? { unit: parsed[0].unit } : {}), mandatory,
      source: { ...source, raw: `${label}: ${text}` },
      ...(!valid ? { issue: "Kravet må tolkes og kontrolleres mot produktdokumentasjonen." } : {})
    };
    entry.id = technicalRevision(entry);
    if (!requirements.some(item => item.id === entry.id)) requirements.push(entry);
  };

  const attributes = productRequirementAttributes(requirement);
  for (const [label, raw] of Object.entries(attributes)) {
    const origin = record(origins[label]);
    add(label, raw, { ...ownSource(""), kind: origin.postNumber && origin.postNumber !== postNumber ? "parent" : "post",
      postNumber: string(origin.postNumber) ?? postNumber, page: page(origin.sourcePage) ?? page(requirement.source_page) });
  }
  // Search intentionally filters broad chapter context. Retain non-metadata clauses
  // for explicit verification rather than allowing that filter to erase obligations.
  for (const [label, raw] of Object.entries(record(value.attributes))) {
    if (Object.hasOwn(attributes, label) || informational.test(technicalText(label)) || /^(?:generelle krav|andre krav|andra krav)$/.test(technicalText(label))) continue;
    const origin = record(origins[label]);
    add(`Kontekstkrav (${label})`, raw, { ...ownSource(""), kind: origin.postNumber && origin.postNumber !== postNumber ? "parent" : "post",
      postNumber: string(origin.postNumber) ?? postNumber, page: page(origin.sourcePage) ?? page(requirement.source_page) });
  }
  // Explicit tokens in the post's own title are data, but bare numbers/ranges are not.
  const title = String(requirement.value_text ?? "");
  const primaryTitle = title.split(/\b(?:med|with|inkludert|inklusive|including)\b/i)[0];
  if (primaryTitle !== title) add("Leveranseomfang", title.slice(primaryTitle.length), ownSource(title));
  const titleValues = [...primaryTitle.matchAll(/\b(DN|PN|K)\s*(\d+(?:[.,]\d+)?)\b/gi)];
  for (const match of titleValues) {
    const label = ({ dn: "DN", pn: "PN", k: "K-faktor" } as Record<string, string>)[match[1].toLowerCase()];
    const property = canonicalProperty(label);
    const ambiguous = /^\s*(?:[-–/]\s*(?:DN|PN|K)?\s*\d|US\b)/i.test(primaryTitle.slice(match.index! + match[0].length))
      || titleValues.some(other => other[1].toLowerCase() === match[1].toLowerCase() && other[2] !== match[2]);
    if (!requirements.some(item => item.property === property)) add(label, ambiguous ? primaryTitle : match[2], ownSource(title));
  }

  // Keep prose and inherited additions visible rather than silently equating "not parsed" with satisfied.
  const specification = string(value.technicalSpecification) ?? string(value.sourceText) ?? string(requirement.source_excerpt) ?? "";
  for (const section of specification.split(/\n\s*UNDERPOST\s*\n/i)) {
    const sectionPost = section.trim().match(/^(\d+(?:\.\d+)+)\b/)?.[1];
    const source: RequirementSource = { ...ownSource(section), kind: sectionPost && sectionPost !== postNumber ? "parent" : "post", postNumber: sectionPost ?? postNumber };
    const freeText: string[] = [];
    for (const line of section.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
      const field = /^([^:]{1,90}):\s*(.+)$/.exec(line);
      if (field) {
        const [label, raw] = field.slice(1);
        const existing = Object.entries(attributes).find(([key]) => technicalText(key) === technicalText(label));
        // Extractor's explicit child value replaces the same parent's field, not unrelated project constraints.
        if (existing) continue;
        add(label, raw, source);
      } else if (!/^\d+(?:\.\d+)+\b|^UNDERPOST$|^[A-Z]{2,5}\d[\w.]*$/i.test(line)
        && !quantityLine.test(line)
        && technicalText(line) !== technicalText(String(requirement.value_text ?? ""))
        && !/^(?:andre|andra) krav\s*:?(?:\s*(?:nei|nej))?$/i.test(line)) freeText.push(line);
    }
    if (freeText.length) add("Spesifikasjonstekst", freeText.join("\n"), source);
  }
  for (const ref of Array.isArray(value.standardRefs) ? value.standardRefs : []) add("Standard", ref, ownSource(String(ref)));
  for (const flag of Array.isArray(value.reviewFlags) ? value.reviewFlags : []) {
    if (/reextracted-requirement-conflict|ocr-source/.test(String(flag))) add("Kravgrunnlag", String(flag), ownSource(String(flag)));
  }
  // Preserve explicit unstructured extra clauses even when not included in the product attributes.
  for (const [label, raw] of Object.entries(record(value.attributes))) {
    if (/^(?:generelle krav|andre krav|andra krav)$/.test(technicalText(label)) && !freeChoice.test(String(raw))) add(label, raw, ownSource(String(raw)));
  }
  return { version: 1, revision: technicalRevision(["effective-requirements-current-post-2", requirement.id, requirement.updated_at, requirements]), requirements };
}

export function effectiveRequirements(requirement: Row): EffectiveRequirementSet {
  const resolved = requirement.effectiveRequirements as EffectiveRequirementSet | undefined;
  return resolved?.version === 1 && Array.isArray(resolved.requirements) ? resolved : resolveEffectiveRequirements(requirement);
}

export function withEffectiveRequirements<T extends Row>(requirement: T) {
  const current = currentPostRequirement(requirement);
  return { ...current, effectiveRequirements: resolveEffectiveRequirements(current) };
}

/** Card, retrieval and evaluation share the same post-only source. */
export function requirementForSearch(requirement: Row): Row {
  return currentPostRequirement(requirement);
}

function record(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function string(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function page(value: unknown) { return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined; }
