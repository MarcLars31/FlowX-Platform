import { normalizeTechnicalText } from "./ahlsell-requirement-context";

/** A row's own heading/code outranks categories inferred from chapter prose. */
export function requirementDiscipline(requirement: Record<string, unknown>) {
  const value = requirement.value_json as Record<string, unknown> | undefined;
  const heading = normalizeTechnicalText(String(requirement.value_text ?? requirement.display_name ?? ""));
  const code = String(value?.nsCode ?? requirement.requirement_key ?? "").trim().toUpperCase();
  if (/^(?:kabel(?:stige|kanal|bro|bane)?|veggkanal|armaturskinne|armatur for belysning|lysarmatur|stikkontakt|fordelingstavle|elektrisk kabel|bryter|led armatur)\b/.test(heading)) return "electrical";
  if (/^(?:ventilasjonskanal|luftkanal|ventilasjonsaggregat|tilluftsventil|avtrekksventil|lydfelle|luftfilter)\b/.test(heading)) return "ventilation";
  if (/^[WX][A-Z]\d/.test(code)) return "electrical";
  if (/^V[A-Z]\d/.test(code)) return "ventilation";
  if (/^U[A-Z]\d/.test(code)) return "plumbing";
  return "unknown";
}

export function genericProductSearch(requirement: Record<string, unknown>) {
  return String(requirement.value_text ?? requirement.display_name ?? "Teknisk produkt")
    .replace(/\s*[-–—]\s*(?:lengde|antall|areal|volum)\s*$/i, "")
    .replace(/\s+/g, " ").trim().slice(0, 160);
}
