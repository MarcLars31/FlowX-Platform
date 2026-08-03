import { notFound } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";
import { ProjectWorkspace, type ProjectModuleData } from "@/components/ProjectWorkspace";

type ProjectPageProps = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: ProjectPageProps) {
  const context = await getOrganizationContext();
  if (!context) return null;
  const { id } = await params;
  const organizationId = context.organization.id;

  const [project] = await selectUserRows<OrganizationProject>("projects", {
    select:
      "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,access_level,created_by,assigned_to,project_manager_id,estimator_id,expected_start_date,expected_delivery_date,internal_comments,technical_parameters,created_at,updated_at",
    id: `eq.${id}`,
    organization_id: `eq.${organizationId}`,
    deleted_at: "is.null",
    limit: "1"
  });
  if (!project) notFound();

  const data: ProjectModuleData = {
    project,
    systemTypes: await selectUserRows("project_system_types", {
      project_id: `eq.${id}`,
      organization_id: `eq.${organizationId}`,
      order: "is_primary.desc,created_at.asc"
    }),
    standards: await selectUserRows("project_standards", {
      project_id: `eq.${id}`,
      organization_id: `eq.${organizationId}`,
      order: "priority.asc,created_at.asc"
    }),
    suppliers: await selectUserRows("project_supplier_options", {
      project_id: `eq.${id}`,
      organization_id: `eq.${organizationId}`,
      order: "supplier_kind.asc,selection_role.asc"
    }),
    technicalDescriptions: context.permissions.includes("technical_description.view")
      ? await selectUserRows("technical_description_documents", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          order: "created_at.desc"
        })
      : [],
    requirements: context.permissions.includes("project.requirement.view")
      ? await selectUserRows("project_requirements", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          order: "updated_at.desc"
        })
      : [],
    conflicts: context.permissions.includes("project.requirement.view")
      ? await selectUserRows("project_requirement_conflicts", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          order: "updated_at.desc"
        })
      : [],
    suggestions: context.permissions.includes("project.product_suggestion.view")
      ? await selectUserRows("project_product_suggestions", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          order: "match_score.desc"
        })
      : [],
    decisions: context.permissions.includes("project.decision.view")
      ? await selectUserRows("project_decisions", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          order: "updated_at.desc"
        })
      : [],
    documents: context.permissions.includes("document.view")
      ? await selectUserRows("project_documents", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          status: "eq.active",
          order: "created_at.desc"
        })
      : []
  };

  return <ProjectWorkspace initialData={data} />;
}
