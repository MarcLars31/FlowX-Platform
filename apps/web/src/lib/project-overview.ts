import { productPostMeasurement } from "./project-requirement-views";
import { distributorRequirementKind, isDistributorLumpSumRequirement } from "./distributor-requirement-lines";
import { projectRequirementDetails } from "./project-requirement-details";
import { productRequirementCategory, PRODUCT_REQUIREMENT_CATEGORY_VERSION } from "./product-requirement-category";
import { projectRequirementDataWarnings } from "./project-requirement-data-warnings";
import { projectRequirementOrderPostNumber } from "./project-requirement-order";
import { requirementSnapshot } from "./requirement-snapshot";
import { projectPostIdentity } from "./project-requirement-identity";
export { projectPostIdentity } from "./project-requirement-identity";

export type OverviewRow = Record<string, unknown> & { id: string };
const valueFields = ["title", "postNumber", "parentPostNumber", "parentDescription", "postScope", "nsCode", "sourceChapter", "sourceOrder", "chapterInformation", "quantity", "quantityText", "unit", "operation", "system", "reviewFlags", "productResolution"] as const;
const rowFields = "id,project_id,category,requirement_key,display_name,value_text,status,source_page,source_document_id,source_technical_description_document_id,created_at,updated_at,edit_revision";

// JSON projections keep specification text and page arrays out of overview queries.
export const REQUIREMENT_SUMMARY_SELECT = [rowFields, ...valueFields.map(key => `overview_${key}:value_json->${key}`)].join(",");
export const HOME_REQUIREMENT_SELECT = ["id,project_id,category,requirement_key,display_name,value_text,status", ...["unit", "operation", "reviewFlags", "productResolution", "sourceText"].map(key => `overview_${key}:value_json->${key}`)].join(",");
export const REQUIREMENT_OVERVIEW_SELECT = `${rowFields},overview_cache:project_requirement_overviews(version,source_updated_at,source_revision,summary)`;
export const TECHNICAL_DOCUMENT_SUMMARY_SELECT = "id,project_id,file_name,file_sha256,status,page_count,created_at,warning_summary";

export function expandOverviewProjection(row: OverviewRow): OverviewRow {
  const output = { ...row };
  const value: Record<string, unknown> = {};
  for (const key of [...valueFields, "attributes", "sourceText"]) {
    value[key] = output[`overview_${key}`];
    delete output[`overview_${key}`];
  }
  return { ...output, value_json: value };
}

export function compactProjectRequirement(row: OverviewRow): OverviewRow {
  row = requirementSnapshot(row);
  const value = record(row.value_json);
  const details = projectRequirementDetails(row);
  const measurement = productPostMeasurement(row);
  const overview = {
    sortPostNumber: projectRequirementOrderPostNumber(row),
    category: productRequirementCategory(row),
    categoryVersion: PRODUCT_REQUIREMENT_CATEGORY_VERSION,
    warnings: projectRequirementDataWarnings(row),
    kind: distributorRequirementKind(row),
    lumpSum: isDistributorLumpSumRequirement(row),
    productPost: measurement.visible,
    productPostMissingQuantity: measurement.missingQuantity
  };
  const result: OverviewRow = { id: row.id };
  for (const key of rowFields.split(",")) if (key in row) result[key] = row[key];
  return {
    ...result,
    overview,
    value_json: { ...Object.fromEntries(valueFields.map(key => [key, value[key]])), postNumber: details.postNumber, nsCode: details.nsCode,
      sourceChapter: value.sourceChapter ?? (details.chapterPost ? { title: details.chapterPost, sourcePage: row.source_page } : null) }
  };
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}


/** Recover only an explicit ancestor heading in a legacy extraction snapshot. */
export function legacyParentDescription(row: OverviewRow): string | null {
  const value = record(row.value_json);
  const parent = typeof value.parentPostNumber === "string" ? value.parentPostNumber.trim() : "";
  const post = typeof value.postNumber === "string" ? value.postNumber.trim() : "";
  if (!/^\d+(?:\.\d+)+$/.test(parent) || !post.startsWith(`${parent}.`)) return null;
  const blocks = typeof value.technicalSpecification === "string" ? value.technicalSpecification.split(/\n\s*UNDERPOST\s*\n/i).slice(0, -1) : [];
  const titles = blocks.flatMap(block => {
    const firstLine = block.trim().split(/\r?\n/)[0];
    if (!firstLine.startsWith(`${parent} `)) return [];
    const title = firstLine.slice(parent.length).replace(/\s+/g, " ").trim();
    // An NS code or a requirement field is not the heading's display title.
    return title && title.length <= 250 && !/^[A-ZÆØÅ]{1,5}\d*\./.test(title) && !title.includes(":") ? [title] : [];
  });
  return new Set(titles).size === 1 ? titles[0] : null;
}

/** One source snapshot per missing heading, only for imports predating parentDescription. */
export function legacyParentHeadingSources(rows: OverviewRow[]) {
  const actualPosts = new Set(rows.map(row => projectPostIdentity(row, record(row.value_json).postNumber)));
  const candidates = new Map<string, OverviewRow>();
  for (const row of rows) {
    const value = record(row.value_json);
    if (typeof value.parentPostNumber !== "string" || !/^\d+(?:\.\d+)+$/.test(value.parentPostNumber)
      || typeof value.postNumber !== "string" || !value.postNumber.startsWith(`${value.parentPostNumber}.`)
      || value.parentDescription) continue;
    const identity = projectPostIdentity(row, value.parentPostNumber);
    if (!actualPosts.has(identity) && !candidates.has(identity)) candidates.set(identity, row);
  }
  return candidates;
}
