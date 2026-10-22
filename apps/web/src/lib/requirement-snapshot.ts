import { separateSavedRequirementHeading } from "./requirement-heading";
import { expandRequirementText } from "./requirement-text-storage";
import { numberedPostHeading } from "@/modules/technical-description-extractor/numbered-post-heading";
export const REQUIREMENT_SNAPSHOT_VERSION = 1;

/** Saved extraction is the source of truth. Reads never re-extract a PDF. A
 * legacy row remains revision 0 until an explicit, audited re-extraction. */
export function requirementSnapshot<T extends Record<string, unknown>>(row: T): T {
  row = expandRequirementText(row);
  const value = row.value_json && typeof row.value_json === "object" && !Array.isArray(row.value_json)
    ? row.value_json as Record<string, unknown> : {};
  const source = value.sourceText ?? row.source_excerpt ?? value.technicalSpecification ?? "";
  const lines = typeof source === "string" ? source.trim().split(/\r?\n/).map(line => line.trim()) : [];
  const heading = numberedPostHeading(lines[0] ?? "", lines[1] ?? "");
  // Repair only the exact legacy concatenation proven by this row's own saved
  // source. Keep IDs, user corrections, product selections and quantities intact.
  const repaired = heading && value.postNumber === heading.legacyPostNumber;
  const oldDescription = [heading?.description.replace(/^\d+(?:\.\d+)+/, ""), ...lines.slice(2)].join(" ");
  const normalize = (text: unknown) => typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  const description = lines.slice(1).join(" ");
  const fields = repaired ? Object.fromEntries(["value_text", "display_name"].flatMap(key =>
    normalize(row[key]) === normalize(oldDescription) ? [[key, description]] : [])) : {};
  return separateSavedRequirementHeading({ ...row, ...fields, value_json: { ...value,
    ...(repaired ? { postNumber: heading.postNumber } : {}),
    extractionVersion: value.extractionVersion ?? 0,
    sourceText: source
  } });
}
