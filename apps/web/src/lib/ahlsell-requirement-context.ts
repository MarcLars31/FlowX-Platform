import { currentPostRequirement } from "./current-post-requirement";
/** Only the immediate parent heading may supply the product of a DN-only row. */
export function immediateParentHeading(requirement: Record<string, unknown>): string {
  const value = record(requirement.value_json);
  if (typeof value.parentDescription === "string") return value.parentDescription;
  const parent = typeof value.parentPostNumber === "string" ? value.parentPostNumber : "";
  const specification = typeof value.technicalSpecification === "string" ? value.technicalSpecification : "";
  if (!parent) return "";
  const block = specification.split(/\n\s*UNDERPOST\s*\n/).find(part => {
    const start = part.trimStart();
    return start.startsWith(`${parent} `) || start.startsWith(`${parent}\n`);
  });
  if (!block) return "";
  const lines = block.trim().split(/\r?\n/);
  return [lines[0].slice(parent.length).replace(/^\s*[A-Z]{2}\d[\w.]*\s*/, ""), lines[1] ?? ""].join(" ").trim();
}

export function valveMonitoringRequirement(text: string): "required" | "none" | null {
  const normalized = normalizeTechnicalText(text);
  if (/\b(?:uten|utan|without)\s+(?:overvaking|overvakning|overvaket|monitoring|supervision)\b/.test(normalized)) return "none";
  return /\b(?:signal (?:ved|nar) stengt ventil|tilkobling for signal|overvaket|overvakning|overvaking|endebrytere?|supervised open|supervisory switch)\b/.test(normalized) ? "required" : null;
}

export function normalizeTechnicalText(value: string) {
  return value.toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Product naming context stops before included parts or the product it serves. */
export function mainProductText(value: string) {
  return normalizeTechnicalText(value).split(/\b(?:med|with|inkl|inkludert|inklusive|including|for|til)\b/)[0].trim();
}

/** Retrieval uses only fields belonging to this post. */
export function productRequirementAttributes(requirement: Record<string, unknown>) {
  const value = record(currentPostRequirement(requirement).value_json);
  return Object.fromEntries(Object.entries(record(value.attributes)).filter(([key]) =>
    !/^(?:pdf kommentar|lokalisering|dokumentasjon|omfang|vannforsyning)$/.test(normalizeTechnicalText(key))));
}

export function productTechnicalSpecification(requirement: Record<string, unknown>) {
  return String(record(currentPostRequirement(requirement).value_json).technicalSpecification ?? "");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
