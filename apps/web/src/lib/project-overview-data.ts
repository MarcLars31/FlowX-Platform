import "server-only";
import { selectAllUserRows, selectUserRows } from "./supabase-user-rest";
import { compactProjectRequirement, expandOverviewProjection, REQUIREMENT_OVERVIEW_SELECT, TECHNICAL_DOCUMENT_SUMMARY_SELECT, type OverviewRow } from "./project-overview";
import { sortProjectRequirementsBySource } from "./project-requirement-order";
import { enrichProjectRequirements } from "./project-requirement-enrichment";
import type { PermissionKey } from "./organization-rbac";

export async function loadProjectOverviewRequirements(projectId: string, organizationId: string, canReadTechnicalDescriptions = true) {
  const rows = (await selectAllUserRows<OverviewRow>("project_requirements", {
    project_id: `eq.${projectId}`, organization_id: `eq.${organizationId}`, deleted_at: "is.null",
    select: REQUIREMENT_OVERVIEW_SELECT, order: "id.asc"
  })).map(expandOverviewProjection);
  // Legacy imports without saved chapter metadata retain their recovered chapters.
  // Current imports already persist this metadata and never read source_pages here.
  const legacyDocumentIds = [...new Set(rows.filter(row => {
    const value = row.value_json as Record<string, unknown>;
    return !value.sourceChapter && typeof row.source_technical_description_document_id === "string";
  }).map(row => String(row.source_technical_description_document_id)))];
  const legacyDocuments = canReadTechnicalDescriptions && legacyDocumentIds.length ? await selectUserRows<OverviewRow>("technical_description_documents", {
    project_id: `eq.${projectId}`, organization_id: `eq.${organizationId}`, id: `in.(${legacyDocumentIds.join(",")})`, select: "id,file_name,source_pages"
  }) : [];
  const requirements = legacyDocuments.length ? enrichProjectRequirements(rows, legacyDocuments) : rows;
  // Preserve the existing created-at/id tie order for rows on the same PDF page.
  requirements.sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) || left.id.localeCompare(right.id));
  return sortProjectRequirementsBySource(requirements.map(compactProjectRequirement));
}

export async function loadProjectOverviewData(projectId: string, organizationId: string, permissions: readonly PermissionKey[]) {
  const filters = { project_id: `eq.${projectId}`, organization_id: `eq.${organizationId}` };
  const [requirements, technicalDescriptions, documents, suggestions, systemTypes, standards, suppliers, conflicts, decisions] = await Promise.all([
    permissions.includes("project.requirement.view") ? loadProjectOverviewRequirements(projectId, organizationId, permissions.includes("technical_description.view")) : [],
    permissions.includes("technical_description.view") ? selectUserRows<OverviewRow>("technical_description_documents", { ...filters, select: TECHNICAL_DOCUMENT_SUMMARY_SELECT, order: "created_at.desc" }) : [],
    permissions.includes("document.view") ? selectUserRows<OverviewRow>("project_documents", { ...filters, select: "id,document_type,file_name,original_filename,checksum,upload_status,processing_status,created_at", status: "eq.active", order: "created_at.desc" }) : [],
    permissions.includes("project.product_suggestion.view") ? selectAllUserRows<OverviewRow>("project_product_suggestions", { ...filters, select: "id,project_id,requirement_id,status,product_snapshot,selected_at,created_at,updated_at", status: "eq.selected", order: "id.asc" }) : [],
    selectUserRows<OverviewRow>("project_system_types", { ...filters, order: "is_primary.desc,created_at.asc" }),
    selectUserRows<OverviewRow>("project_standards", { ...filters, order: "priority.asc,created_at.asc" }),
    selectUserRows<OverviewRow>("project_supplier_options", { ...filters, order: "supplier_kind.asc,selection_role.asc" }),
    permissions.includes("project.requirement.view") ? selectUserRows<OverviewRow>("project_requirement_conflicts", { ...filters, order: "updated_at.desc" }) : [],
    permissions.includes("project.decision.view") ? selectUserRows<OverviewRow>("project_decisions", { ...filters, order: "updated_at.desc" }) : []
  ]);
  return { requirements, technicalDescriptions, documents, suggestions, systemTypes, standards, suppliers, conflicts, decisions, mappingMemories: [], mappingAccessories: [] };
}
