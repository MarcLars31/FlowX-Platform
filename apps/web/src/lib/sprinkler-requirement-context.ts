import { immediateParentHeading, mainProductText, normalizeTechnicalText, productRequirementAttributes } from "./ahlsell-requirement-context";
import { ns3420ProductFamily } from "./ns3420-product-classification";

/** Explicit product/system evidence only. A saved category or catalogue hit is not source evidence. */
export function hasSprinklerText(text: string) {
  const normalized = positiveSprinklerText(text);
  return /\b(?:sprinkler\w*|sprinkel\w*|spray ?sprinkler\w*|boligsprinkler\w*|torrsprinkler\w*|vicflex|dryflex|(?:wet|dry|vat|torr) alarm ?valve|(?:vat|torr) alarmventil)\b/.test(normalized)
    || hasSprinklerHeadText(normalized);
}

export function hasSprinklerHeadText(text: string) {
  const main = mainProductText(positiveSprinklerText(text));
  return /\b(?:sprinkler(?:hode[rt]?|huvud| head)?|sprinkelhode[rt]?|spraysprinkler|boligsprinkler|torrsprinkler|institusjonssprinkler|korridorsprinkler|vindussprinkler|standard spray)\b/.test(main)
    || /\bv\d{4}\b/.test(main) && /\bk\s*\d+\b/.test(main) && /\b(?:qr|sr|pendent|upright)\b/.test(main);
}

function sourceParts(requirement: Record<string, unknown>) {
  const value = record(requirement.value_json);
  const origins = record(value.attributeSources);
  const attributes = Object.entries(productRequirementAttributes(requirement)).filter(([key, item]) => {
    const origin = record(origins[key]).postNumber;
    return (!origin || origin === value.postNumber || origin === value.parentPostNumber) && hasFieldValue(item);
  });
  // UNDERPOST separates ancestor specifications. Broader chapters and comments
  // cannot turn an unrelated row into a sprinkler product.
  const ownSource = [value.sourceText, requirement.source_excerpt, value.technicalSpecification]
    .filter((item): item is string => typeof item === "string")
    .map(item => item.split(/\n\s*UNDERPOST\s*\n/i).at(-1) ?? "")
    .map(item => item.split(/\r?\n/).filter(line => {
      if (/^\s*(?:pdf[- ]kommentar|kapittel|generelle krav)\s*:/i.test(line)) return false;
      const field = line.match(/^\s*([^:]+):\s*(.*)$/);
      return !field || !/sprinkl/i.test(field[1]) || hasFieldValue(field[2]);
    }).join("\n"));
  return { value, attributes, ownSource, description: String(requirement.value_text ?? requirement.display_name ?? "") };
}

export function hasSprinklerContext(requirement: Record<string, unknown>) {
  const { value, attributes, ownSource, description } = sourceParts(requirement);
  return ns3420ProductFamily(value.nsCode ?? requirement.requirement_key, description) === "sprinkler_hose"
    || hasSprinklerText([description, ...ownSource, immediateParentHeading(requirement),
      ...attributes.map(([key, item]) => `${key}: ${item}`)].join("\n"));
}

export function hasSprinklerHeadEvidence(requirement: Record<string, unknown>) {
  const { attributes, ownSource, description } = sourceParts(requirement);
  if (hasSprinklerHeadText(description)) return true;
  if (attributes.some(([key]) => /^(?:type sprinkler|sprinklertype|sprinkler type)$/.test(normalizeTechnicalText(key)))) return true;
  // A source heading can supply a missing product name, but an incidental
  // reference to the system or an included sprinkler must not do so.
  return ownSource.some(source => source.split(/\r?\n/).some(line => {
    const normalized = positiveSprinklerText(line);
    return /^(?:sprinkler(?:hode[rt]?|huvud| head)?|spraysprinkler|torrsprinkler)\b/.test(normalized)
      || /^(?:type sprinkler|sprinklertype|sprinkler type)\s+\S/.test(normalized);
  }));
}

function positiveSprinklerText(text: string) {
  return normalizeTechnicalText(text)
    .replace(/\b(?:utan|uten|without|inte|ikke|not|ingen|no)\s+(?:(?:en|ett|a|an)\s+)?sprinkl\w*/g, "")
    .replace(/\bsprinkl\w*\s+(?:nei|nej|no|ikke aktuelt|ej aktuellt|not applicable)\b/g, "");
}

function hasFieldValue(value: unknown) {
  if (value === null || value === undefined) return false;
  const normalized = normalizeTechnicalText(String(value));
  return normalized !== "" && !/^(?:nei|nej|no|ikke aktuelt|ej aktuellt|not applicable)$/.test(normalized);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
