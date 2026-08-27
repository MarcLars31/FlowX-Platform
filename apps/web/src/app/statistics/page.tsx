import { BusinessDevelopmentDashboard } from "@/components/BusinessDevelopmentDashboard";
import {
  buildBusinessDevelopmentStatistics,
  type BusinessDevelopmentAssignmentRow,
  type BusinessDevelopmentRequirementRow
} from "@/lib/business-development-statistics";
import { getOrganizationContext } from "@/lib/organization-context";
import {
  buildProjectStatistics,
  type ProjectStatisticsRow
} from "@/lib/project-statistics";
import { selectUserRows } from "@/lib/supabase-user-rest";

type StatisticsProjectRow = ProjectStatisticsRow & {
  id: string;
  name: string;
  project_number: string | null;
  updated_at: string;
};

export default async function StatisticsPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const organizationId = context.organization.id;
  const [projects, requirements, assignments] = await Promise.all([
    selectUserRows<StatisticsProjectRow>("projects", {
      select: "id,name,project_number,status,current_stage,created_at,updated_at",
      organization_id: `eq.${organizationId}`,
      deleted_at: "is.null",
      order: "updated_at.desc",
      limit: "200"
    }),
    selectUserRows<BusinessDevelopmentRequirementRow>("project_requirements", {
      select: "id,project_id,category,requirement_key,display_name,value_text,value_json,mapping_fingerprint,status",
      organization_id: `eq.${organizationId}`,
      deleted_at: "is.null",
      limit: "2000"
    }),
    selectUserRows<BusinessDevelopmentAssignmentRow>("project_product_suggestions", {
      select: "requirement_id,status,product_snapshot",
      organization_id: `eq.${organizationId}`,
      status: "eq.selected",
      limit: "2000"
    })
  ]);

  return (
    <BusinessDevelopmentDashboard
      organizationName={context.organization.name}
      projects={projects}
      projectStatistics={buildProjectStatistics(projects)}
      businessStatistics={buildBusinessDevelopmentStatistics({
        requirements,
        assignments
      })}
    />
  );
}
