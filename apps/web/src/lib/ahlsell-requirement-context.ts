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

/** Keep chapter prose available for review without treating every mentioned
 * component or system dimension as a property of this product. */
export function productRequirementAttributes(requirement: Record<string, unknown>) {
  const value = record(requirement.value_json);
  const sources = record(value.attributeSources);
  const missingParent = Array.isArray(value.reviewFlags) && value.reviewFlags.includes("missing-parent-context");
  return Object.fromEntries(Object.entries(record(value.attributes)).filter(([key]) => {
    const name = normalizeTechnicalText(key);
    if (/^(?:kapittel|kapittelpost|generelle krav|pdf kommentar|lokalisering|dokumentasjon|omfang|vannforsyning)$/.test(name)) return false;
    const origin = record(sources[key]).postNumber;
    if (!origin || origin === value.postNumber || !missingParent && origin === value.parentPostNumber) return true;
    if (missingParent) return false;
    return /^(?:materiale|materialkvalitet|skjot|trykk|dimensjon(?: .*)?|gjengedimensjon(?: .*)?|k faktor|folsomhetsgrad|utlosningstemperatur|overflatebehandling|type sprinkler|sprinkleranlegg)$/.test(name);
  }));
}

export function productTechnicalSpecification(requirement: Record<string, unknown>) {
  const value = record(requirement.value_json);
  const text = String(value.technicalSpecification ?? value.sourceText ?? requirement.source_excerpt ?? "");
  // Each UNDERPOST boundary represents another ancestor, not one continuous
  // description of this product. The nearest parent supplies the shared spec.
  const missingParent = Array.isArray(value.reviewFlags) && value.reviewFlags.includes("missing-parent-context");
  return text.split(/\n\s*UNDERPOST\s*\n/).slice(missingParent ? -1 : -2).join("\n\nUNDERPOST\n");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
