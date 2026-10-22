import { normalizeQuantityUnit, parseQuantityNumber } from "./quantity-value";
import { isDistributorLumpSumRequirement, type DistributorRequirementRow } from "./distributor-requirement-lines";

/** Only measured/unit/RS posts enter the card list. All source rows remain stored. */
export function visibleProjectRequirements<Row extends DistributorRequirementRow>(requirements: Row[]) {
  return requirements.filter(row => !["rejected", "superseded"].includes(String(row.status ?? "")) && productPostMeasurement(row).visible);
}

const quantityUnits = new Set(["st", "m", "m2", "m3", "kg", "l", "t", "tonn", "h", "time", "timer", "dag", "dager", "døgn", "sett", "par"]);

/** Actual source columns take precedence over legacy inferred amounts. With
 * legacy rows, use their own structured fields or an explicit standalone RS
 * quantity line, never numbers/Antall in prose or inherited specifications. */
export function productPostMeasurement(requirement: DistributorRequirementRow): { visible: boolean; missingQuantity: boolean } {
  const overview = record(requirement.overview);
  if (typeof overview.productPost === "boolean") return { visible: overview.productPost, missingQuantity: overview.productPostMissingQuantity === true };
  const value = record(requirement.value_json), columns = record(value.pdfColumnValues);
  const hasColumns = typeof columns.unit === "string" && typeof columns.quantity === "string";
  const unit = normalizeQuantityUnit(hasColumns ? columns.unit : value.unit);
  const amount = hasColumns ? columns.quantity : value.quantity;
  const parsed = parseQuantityNumber(amount), validAmount = parsed !== null && parsed >= 0;
  const populated = (cell: unknown) => typeof cell === "string" && Boolean(cell.trim()) && !/^(?:[?—–-]+|unknown|ukjent|null|undefined|n\/a)$/i.test(cell.trim());
  const hasUnit = hasColumns ? populated(unit) && !/^(?:enh|enhet|unit|antall|mengde|pris|sum)$/i.test(unit) : quantityUnits.has(unit) || unit === "RS";
  const hasAmount = hasColumns ? populated(amount) : validAmount;
  const rsLine = /^\s*(?:RS|Rund\s+sum(?:\s+RS)?)(?:\s+[\d., ]+)?\s*$/im;
  const rs = unit === "RS" || (!unit && !hasAmount && [value.quantityText, value.sourceText ?? requirement.source_excerpt].some(text => typeof text === "string" && rsLine.test(text.split(/\n\s*UNDERPOST\s*\n/i).at(-1) ?? "")));
  const visible = hasUnit || hasAmount || rs;
  return { visible, missingQuantity: visible && !rs && !validAmount };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Internal purchasing categories; these do not decide which cards are visible.
 * Information is not demolition.
 * Work/removal operations and workflow eligibility are classified separately. */
export function groupProjectRequirementViews<Row extends DistributorRequirementRow>(requirements: Row[]) {
  const groups = { products: [] as Row[], information: [] as Row[], rs: [] as Row[] };
  for (const requirement of requirements) {
    if (["rejected", "superseded"].includes(String(requirement.status ?? ""))) continue;
    if (isDistributorLumpSumRequirement(requirement)) {
      groups.rs.push(requirement);
      continue;
    }
    const value = requirement.value_json as { quantity?: unknown; unit?: unknown; reviewFlags?: unknown } | null;
    const quantity = parseQuantityNumber(value?.quantity);
    const hasQuantity = quantity !== null && quantity >= 0;
    const hasUnit = quantityUnits.has(normalizeQuantityUnit(value?.unit));
    const information = Array.isArray(value?.reviewFlags) && value.reviewFlags.includes("project-information");
    groups[hasQuantity && hasUnit && !information ? "products" : "information"].push(requirement);
  }
  return groups;
}
