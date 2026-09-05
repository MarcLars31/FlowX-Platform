import {
  buildProjectMaterialRows,
  type MaterialListAssignment,
  type MaterialListProject,
  type MaterialListRequirement
} from "@/lib/project-material-list-export";
import { selectUserRows } from "@/lib/supabase-user-rest";

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

  const [requirements, assignments] = await Promise.all([
    selectUserRows<MaterialListRequirement>("project_requirements", {
      select: "id,category,requirement_key,value_text,value_json",
      project_id: `eq.${projectId}`,
      organization_id: `eq.${organizationId}`,
      deleted_at: "is.null",
      order: "created_at.asc",
      limit: "1000"
    }),
    selectUserRows<MaterialListAssignment>("project_product_suggestions", {
      select: "id,requirement_id,status,product_snapshot,selected_at",
      project_id: `eq.${projectId}`,
      organization_id: `eq.${organizationId}`,
      status: "eq.selected",
      order: "selected_at.asc.nullslast,created_at.asc",
      limit: "1000"
    })
  ]);

  return {
    project,
    rows: buildProjectMaterialRows({ requirements, assignments })
  };
}
