import { normalizeTechnicalText } from "./ahlsell-requirement-context";

export function requirementHeading(requirement: Record<string, unknown>) {
  return String(requirement.value_text || requirement.display_name || "").trim().split(/\r?\n/)[0];
}

/** Only the post's own code, never codes mentioned in chapter text or comments. */
export function requirementNsCode(requirement: Record<string, unknown>) {
  const value = requirement.value_json as Record<string, unknown> | undefined;
  const code = String(value?.nsCode || requirement.requirement_key || "").trim().toUpperCase();
  return /^[A-Z]{2}\d/.test(code) ? code : "";
}

/** A row's own heading/code outranks categories inferred from chapter prose. */
export function requirementDiscipline(requirement: Record<string, unknown>) {
  const heading = normalizeTechnicalText(requirementHeading(requirement));
  const code = requirementNsCode(requirement);
  if (/^(?:kabel\w*|veggkanal|vaggkanal|installasjonskanal|installationskanal|armaturskinne|armatur for (?:belysning|nod|reserve)|lysarmatur\w*|stikkontakt|uttag|grenstav|fordelingstavle|elkraftfordeling|elektrisk kabel|bryter|led armatur|elror|elektrikerror|trekkeror|jordingsmateriell|hoyspenningskabel|automatiseringsniva|styringskoder)\b/.test(heading)) return "electrical";
  if (/^(?:ventilasjonskanal|ventilationskanal|luftkanal|ventilasjonsaggregat|ventilationsaggregat|tilluftsventil|avtrekksventil|luftdon|lydfelle|lyddemper|luftfilter)\b/.test(heading)) return "ventilation";
  // YB automation is present in the customer's electrical specification.
  if (/^YB\d/.test(code)) return "electrical";
  if (/^[WX][A-Z]\d/.test(code)) return "electrical";
  if (/^V[A-Z]\d/.test(code)) return "ventilation";
  if (/^U[A-Z]\d/.test(code)) return "plumbing";
  return "unknown";
}

export function genericProductSearch(requirement: Record<string, unknown>) {
  return (requirementHeading(requirement) || "Teknisk produkt")
    .replace(/\s*[-–—]\s*(?:lengde|antall|areal|volum)\s*$/i, "")
    .replace(/\s+/g, " ").trim().slice(0, 160);
}
