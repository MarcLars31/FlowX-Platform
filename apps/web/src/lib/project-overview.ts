import { distributorRequirementKind, isDistributorLumpSumRequirement } from "./distributor-requirement-lines";
import { projectRequirementDetails } from "./project-requirement-details";
import { productRequirementCategory } from "./product-requirement-category";
import { projectRequirementDataWarnings } from "./project-requirement-data-warnings";
import { projectRequirementOrderPostNumber } from "./project-requirement-order";

export type OverviewRow = Record<string, unknown> & { id: string };
const valueFields = ["postNumber", "parentPostNumber", "nsCode", "sourceChapter", "quantity", "quantityText", "unit", "operation", "system", "reviewFlags", "productResolution"] as const;
const rowFields = "id,project_id,category,requirement_key,display_name,value_text,status,source_page,source_document_id,source_technical_description_document_id,created_at,updated_at,edit_revision";

// JSON projections keep specification text and page arrays out of overview queries.
export const REQUIREMENT_SUMMARY_SELECT = [rowFields, ...valueFields.map(key => `overview_${key}:value_json->${key}`)].join(",");
export const HOME_REQUIREMENT_SELECT = ["id,project_id,category,requirement_key,display_name,value_text,status", ...["unit", "operation", "reviewFlags", "productResolution", "sourceText"].map(key => `overview_${key}:value_json->${key}`)].join(",");
export const REQUIREMENT_OVERVIEW_SELECT = `${REQUIREMENT_SUMMARY_SELECT},source_excerpt,overview_attributes:value_json->attributes`;
export const TECHNICAL_DOCUMENT_SUMMARY_SELECT = "id,project_id,file_name,file_sha256,status,page_count,created_at";

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
  const value = record(row.value_json);
  const details = projectRequirementDetails(row);
  const overview = {
    sortPostNumber: projectRequirementOrderPostNumber(row),
    category: productRequirementCategory(row),
    warnings: projectRequirementDataWarnings(row),
    kind: distributorRequirementKind(row),
    lumpSum: isDistributorLumpSumRequirement(row)
  };
  const result: OverviewRow = { id: row.id };
  for (const key of rowFields.split(",")) if (key in row) result[key] = row[key];
  return {
    ...result,
    overview,
    value_json: { ...Object.fromEntries(valueFields.map(key => [key, value[key]])), postNumber: details.postNumber, nsCode: details.nsCode }
  };
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
