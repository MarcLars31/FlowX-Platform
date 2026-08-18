import { notFound } from "next/navigation";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";
import { ProjectWorkspace, type ProjectModuleData } from "@/components/ProjectWorkspace";
import { ProjectAccessEditor } from "@/components/ProjectAccessEditor";
import { loadDistributorProductMemory } from "@/lib/distributor-product-memory";
import {
  isGuidedProjectTab,
  type GuidedProjectTab
} from "@/lib/guided-project-workflow";

type ProjectPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
};

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const context = await getOrganizationContext();
  if (!context) return null;
  const { id } = await params;
  const requestedStep = (await searchParams).step;
  const initialTab: GuidedProjectTab = isGuidedProjectTab(requestedStep)
    ? requestedStep
    : "overview";
  const organizationId = context.organization.id;

  const [project] = await selectUserRows<OrganizationProject>("projects", {
    select:
      "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,address,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,current_stage,access_level,created_by,assigned_to,project_manager_id,estimator_id,expected_start_date,expected_delivery_date,internal_comments,technical_parameters,demo_data_set_id,created_at,updated_at",
    id: `eq.${id}`,
    organization_id: `eq.${organizationId}`,
    deleted_at: "is.null",
    limit: "1"
  });
  if (!project) notFound();

  const canManageAccess = context.permissions.includes("project.manage_members");
  let accessData: {
    teams: Array<{ id: string; name: string }>;
    members: Array<{ organizationMemberId: string; projectRole: "owner" | "editor" | "reviewer" | "viewer"; label: string }>;
    memberOptions: Array<{ organizationMemberId: string; label: string }>;
  } = { teams: [], members: [], memberOptions: [] };
  if (canManageAccess) {
    const [teams, projectMembers, organizationMembers] = await Promise.all([
      selectUserRows<{ id: string; name: string }>("teams", {
        select: "id,name",
        organization_id: `eq.${organizationId}`,
        status: "eq.active",
        order: "name.asc"
      }),
      selectUserRows<{ organization_member_id: string; project_role: "owner" | "editor" | "viewer"; role: "project_manager" | "editor" | "reviewer" | "viewer" }>("project_members", {
        select: "organization_member_id,project_role,role",
        project_id: `eq.${id}`
      }),
      selectUserRows<{ id: string; user_id: string }>("organization_members", {
        select: "id,user_id",
        organization_id: `eq.${organizationId}`,
        status: "eq.active",
        order: "created_at.asc"
      })
    ]);
    const userIds = organizationMembers.map((member) => member.user_id);
    const profiles = userIds.length
      ? await selectUserRows<{ id: string; display_name: string | null; email: string | null }>("profiles", {
          select: "id,display_name,email",
          id: `in.(${userIds.join(",")})`
        })
      : [];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const labelByMemberId = new Map(organizationMembers.map((member) => {
      const profile = profileById.get(member.user_id);
      return [member.id, profile?.display_name ?? profile?.email ?? "Namnlös användare"] as const;
    }));
    accessData = {
      teams,
      members: projectMembers.map((member) => ({
        organizationMemberId: member.organization_member_id,
        projectRole: member.role === "project_manager" ? "owner" : member.role,
        label: labelByMemberId.get(member.organization_member_id) ?? "Namnlös användare"
      })),
      memberOptions: organizationMembers.map((member) => ({
        organizationMemberId: member.id,
        label: labelByMemberId.get(member.id) ?? "Namnlös användare"
      }))
    };
  }

  const requirements = context.permissions.includes("project.requirement.view")
    ? await selectUserRows<Record<string, unknown> & { id: string }>(
        "project_requirements",
        {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          order: "updated_at.desc"
        }
      )
    : [];
  const productMemory = context.permissions.includes(
    "project.product_suggestion.view"
  )
    ? await loadDistributorProductMemory(organizationId, requirements)
    : { mappingMemories: [], mappingAccessories: [] };

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
    requirements,
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
    mappingMemories: productMemory.mappingMemories,
    mappingAccessories: productMemory.mappingAccessories,
    documents: context.permissions.includes("document.view")
      ? await selectUserRows("project_documents", {
          project_id: `eq.${id}`,
          organization_id: `eq.${organizationId}`,
          status: "eq.active",
          order: "created_at.desc"
        })
      : []
  };

  return (
    <div className="space-y-6">
      <ProjectWorkspace initialData={data} initialTab={initialTab} />
      {canManageAccess && (
        <details className="group mx-auto max-w-[1500px] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <span>
              <span className="block font-semibold text-ink-950">Projektåtkomst och medlemmar</span>
              <span className="mt-1 block text-sm text-ink-600">{accessData.members.length} medlemmar · {project.access_level === "organization" ? "hela organisationen" : project.access_level === "team" ? "valt team" : project.access_level === "restricted" ? "endast projektmedlemmar" : "ägare och tilldelade"}</span>
            </span>
            <span className="rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-600 transition group-open:bg-flow-100 group-open:text-flow-700">Hantera</span>
          </summary>
          <div className="border-t border-ink-100">
            <ProjectAccessEditor
              projectId={project.id}
              initialAccessLevel={project.access_level}
              initialTeamId={project.team_id ?? null}
              teams={accessData.teams}
              memberOptions={accessData.memberOptions}
              initialMembers={accessData.members}
              embedded
            />
          </div>
        </details>
      )}
    </div>
  );
}
