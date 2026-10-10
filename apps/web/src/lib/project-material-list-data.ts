import { deliveryExportNotes, type DeliveryReview } from "./project-delivery";
import {
  buildProjectMaterialRows,
  type MaterialListAssignment,
  type MaterialListProject,
  type MaterialListRequirement
} from "@/lib/project-material-list-export";
import { selectUserRows, selectAllUserRows } from "@/lib/supabase-user-rest";

export async function loadProjectMaterialListData(
  projectId: string,
  organizationId: string
) {
  const [project] = await selectUserRows<MaterialListProject>("projects", {
    select: "id,name,project_number,customer_name,end_customer,standard,system_type,supplier,status",
    id: `eq.${projectId}`,
    organization_id: `eq.${organizationId}`,
    deleted_at: "is.null",
    limit: "1"
  });
  if (!project) return null;

  const [requirements, assignments, reviews] = await Promise.all([
    selectAllUserRows<MaterialListRequirement>("project_requirements", {
      select: "id,category,requirement_key,value_text,value_json,source_excerpt,updated_at,edit_revision",
      project_id: `eq.${projectId}`,
      organization_id: `eq.${organizationId}`,
      deleted_at: "is.null",
      order: "source_page.asc,created_at.asc,id.asc",
      status: "not.in.(rejected,superseded)"
    }),
    selectAllUserRows<MaterialListAssignment>("project_product_suggestions", {
      select: "id,requirement_id,status,product_snapshot,selected_at",
      project_id: `eq.${projectId}`,
      organization_id: `eq.${organizationId}`,
      status: "eq.selected",
      order: "selected_at.asc.nullslast,created_at.asc,id.asc"
    }),
    selectAllUserRows<{ requirement_id: string; product_revision: number; review: DeliveryReview }>("project_post_workflows", { project_id: `eq.${projectId}`, organization_id: `eq.${organizationId}`, order: "requirement_id.asc" })
  ]);

  return {
    project,
    rows: buildProjectMaterialRows({ requirements, assignments }).map(row => {
      const workflow = reviews.find(w => w.requirement_id === row.requirementId);
      const requirement = requirements.find(r => r.id === row.requirementId) as (MaterialListRequirement & { edit_revision: number }) | undefined;
      return { ...row, notes: [row.notes, deliveryExportNotes(workflow?.review, Boolean(workflow && workflow.product_revision !== requirement?.edit_revision))].filter(Boolean).join(" · ") };
    })
  };
}
