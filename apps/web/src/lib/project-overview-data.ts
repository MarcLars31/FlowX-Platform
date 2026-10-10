import "server-only";
import { selectAllUserRows, selectUserRows } from "./supabase-user-rest";
import { compactProjectRequirement, expandOverviewProjection, REQUIREMENT_OVERVIEW_SELECT, TECHNICAL_DOCUMENT_SUMMARY_SELECT, type OverviewRow } from "./project-overview";
import { sortProjectRequirementsBySource } from "./project-requirement-order";
import type { PermissionKey } from "./organization-rbac";

export async function loadProjectOverviewRequirements(projectId: string, organizationId: string) {
  const rows = (await selectAllUserRows<OverviewRow>("project_requirements", {
    project_id: `eq.${projectId}`, organization_id: `eq.${organizationId}`, deleted_at: "is.null",
    select: REQUIREMENT_OVERVIEW_SELECT, order: "id.asc"
  }, { pagination: "id" })).map(expandOverviewProjection);
  const requirements = rows;
  // Preserve the existing created-at/id tie order for rows on the same PDF page.
  requirements.sort((left, right) => String(left.created_at ?? "").localeCompare(String(right.created_at ?? "")) || left.id.localeCompare(right.id));
  return sortProjectRequirementsBySource(requirements.map(compactProjectRequirement));
}

export async function loadProjectOverviewData(projectId: string, organizationId: string, permissions: readonly PermissionKey[]) {
  const filters = { project_id: `eq.${projectId}`, organization_id: `eq.${organizationId}` };
  const [requirements, technicalDescriptions, documents, suggestions, systemTypes, standards, suppliers, conflicts, decisions] = await Promise.all([
    permissions.includes("project.requirement.view") ? loadProjectOverviewRequirements(projectId, organizationId) : [],
    permissions.includes("technical_description.view") ? selectUserRows<OverviewRow>("technical_description_documents", { ...filters, select: TECHNICAL_DOCUMENT_SUMMARY_SELECT, order: "created_at.desc" }) : [],
    permissions.includes("document.view") ? selectUserRows<OverviewRow>("project_documents", { ...filters, select: "id,document_type,file_name,original_filename,checksum,storage_path,upload_status,processing_status,created_at", status: "eq.active", order: "created_at.desc" }) : [],
    permissions.includes("project.product_suggestion.view") ? selectAllUserRows<OverviewRow>("project_product_suggestions", { ...filters, select: "id,project_id,requirement_id,status,product_snapshot,selected_at,created_at,updated_at", status: "eq.selected", order: "id.asc" }, { pagination: "id" }) : [],
    selectUserRows<OverviewRow>("project_system_types", { ...filters, order: "is_primary.desc,created_at.asc" }),
    selectUserRows<OverviewRow>("project_standards", { ...filters, order: "priority.asc,created_at.asc" }),
    selectUserRows<OverviewRow>("project_supplier_options", { ...filters, order: "supplier_kind.asc,selection_role.asc" }),
    permissions.includes("project.requirement.view") ? selectUserRows<OverviewRow>("project_requirement_conflicts", { ...filters, order: "updated_at.desc" }) : [],
    permissions.includes("project.decision.view") ? selectUserRows<OverviewRow>("project_decisions", { ...filters, order: "updated_at.desc" }) : []
  ]);
  return { requirements, technicalDescriptions, documents, suggestions, systemTypes, standards, suppliers, conflicts, decisions, mappingMemories: [], mappingAccessories: [] };
}
