export type DistributorRequirementRow = Record<string, unknown> & { id: string };

const hiddenStatuses = new Set(["rejected", "superseded"]);

export function splitDistributorRequirementLines<
  Row extends DistributorRequirementRow
>(requirements: Row[]) {
  const visibleRequirements = requirements.filter(
    (requirement) => !hiddenStatuses.has(String(requirement.status ?? ""))
  );

  return {
    productRequirements: visibleRequirements.filter(
      (requirement) => distributorRequirementKind(requirement) === "product"
    ),
    removalRequirements: visibleRequirements.filter(
      (requirement) => distributorRequirementKind(requirement) === "remove"
    ),
    workRequirements: visibleRequirements.filter(
      (requirement) => distributorRequirementKind(requirement) === "work"
    )
  };
}

export function distributorRequirementKind(
  requirement: DistributorRequirementRow
): "product" | "remove" | "work" {
  if (distributorRequirementOperation(requirement) === "remove") return "remove";
  const value = record(requirement.value_json);
  const searchable = normalize([
    requirement.category,
    requirement.requirement_key,
    requirement.display_name,
    requirement.value_text,
    requirement.source_excerpt,
    value.sourceText,
    value.technicalSpecification
  ].map(flattenText).join(" "));

  if (/\b(?:hulltaking|utsparing|trykktesting av romintegritet|romintegritetstest|maling etter gjennomforing|groft(?:ekasser)?|gravearbeid|uttak og utlegging av losmasser|tilbakefylling|kryssing|langsforing)\b/.test(searchable)) {
    return "work";
  }
  if (/\bkomplett\b/.test(searchable) && /\brund sum\b/.test(searchable)) return "work";
  return "product";
}

export function distributorRequirementOperation(
  requirement: DistributorRequirementRow
) {
  return String(record(requirement.value_json).operation ?? "install").toLowerCase();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function flattenText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(flattenText).join(" ");
  return "";
}

function normalize(value: string) {
  return value.toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
