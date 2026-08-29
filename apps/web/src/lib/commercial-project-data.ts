import "server-only";
import type { BusinessDevelopmentRequirementRow } from "@/lib/business-development-statistics";
import type {
  CommercialAssignmentRow,
  CommercialProjectRow
} from "@/lib/commercial-project-insights";
import type { OrganizationContext } from "@/types/organization";
import { selectAllUserRows } from "@/lib/supabase-user-rest";

export type CommercialProfileRow = {
  id: string;
  display_name: string | null;
};

export type CommercialProjectData = {
  projects: CommercialProjectRow[];
  requirements: BusinessDevelopmentRequirementRow[];
  assignments: CommercialAssignmentRow[];
  profiles: CommercialProfileRow[];
  hasRequirementInsights: boolean;
  hasProductSelectionInsights: boolean;
};

type CommercialProjectDataOptions = {
  includeProfiles?: boolean;
  projectScope?: "all" | "open";
};

const PROJECT_FILTER_CHUNK_SIZE = 100;

/**
 * Loads the projects the current user may access. Project RLS remains the
 * authority; the organization filter only narrows the request to the selected
 * organization. Demo projects are intentionally excluded from live KPIs.
 */
export async function loadCommercialProjectData(
  context: OrganizationContext,
  options: CommercialProjectDataOptions = {}
): Promise<CommercialProjectData> {
  const organizationId = context.organization.id;
  const hasRequirementInsights = context.permissions.includes("project.requirement.view");
  const hasProductSelectionInsights = context.permissions.includes(
    "project.product_suggestion.view"
  );

  const candidateProjects = await selectAllUserRows<CommercialProjectRow>("projects", {
    select:
      "id,name,customer_name,end_customer,project_number,status,current_stage,created_at,updated_at,created_by,assigned_to,project_manager_id,expected_delivery_date,demo_data_set_id",
    organization_id: `eq.${organizationId}`,
    deleted_at: "is.null",
    demo_data_set_id: "is.null",
    ...(options.projectScope === "open"
      ? { status: "not.in.(completed,archived)" }
      : {}),
    order: "id.asc"
  });
  const projects = options.projectScope === "open"
    ? candidateProjects.filter(isOpenProject)
    : candidateProjects;
  const projectIds = new Set(projects.map((project) => project.id));

  const [rawRequirements, rawAssignments] = await Promise.all([
    hasRequirementInsights && projects.length > 0
      ? selectRowsForProjectScope<BusinessDevelopmentRequirementRow>(options.projectScope, "project_requirements", [...projectIds], {
          select:
            "id,project_id,category,requirement_key,display_name,value_text,value_json,mapping_fingerprint,status",
          organization_id: `eq.${organizationId}`,
          deleted_at: "is.null",
          order: "id.asc"
        })
      : Promise.resolve([]),
    hasRequirementInsights && hasProductSelectionInsights && projects.length > 0
      ? selectRowsForProjectScope<CommercialAssignmentRow>(options.projectScope, "project_product_suggestions", [...projectIds], {
          select:
            "id,project_id,requirement_id,status,product_snapshot,selected_at,created_at,updated_at",
          organization_id: `eq.${organizationId}`,
          status: "eq.selected",
          order: "id.asc"
        })
      : Promise.resolve([])
  ]);

  const requirements = rawRequirements.filter((row) => projectIds.has(row.project_id));
  const assignments = rawAssignments.filter((row) => projectIds.has(row.project_id));
  const ownerIds = [...new Set(
    projects
      .map((project) => project.assigned_to ?? project.project_manager_id ?? project.created_by)
      .filter((id): id is string => Boolean(id))
  )];
  const profiles = options.includeProfiles !== false && ownerIds.length > 0
    ? await selectOwnerProfiles(ownerIds)
    : [];

  return {
    projects,
    requirements,
    assignments,
    profiles,
    hasRequirementInsights,
    hasProductSelectionInsights
  };
}

function selectRowsForProjectScope<Row>(
  projectScope: CommercialProjectDataOptions["projectScope"],
  table: string,
  projectIds: readonly string[],
  params: Record<string, string> & { order: string }
) {
  return projectScope === "open"
    ? selectRowsForProjects<Row>(table, projectIds, params)
    : selectAllUserRows<Row>(table, params);
}

async function selectRowsForProjects<Row>(
  table: string,
  projectIds: readonly string[],
  params: Record<string, string> & { order: string }
) {
  const rows: Row[] = [];
  for (let start = 0; start < projectIds.length; start += PROJECT_FILTER_CHUNK_SIZE) {
    const ids = projectIds.slice(start, start + PROJECT_FILTER_CHUNK_SIZE);
    rows.push(...await selectAllUserRows<Row>(table, {
      ...params,
      project_id: `in.(${ids.join(",")})`
    }));
  }
  return rows;
}

function isOpenProject(project: CommercialProjectRow) {
  return project.current_stage !== "completed"
    && !["completed", "archived"].includes(project.status);
}

async function selectOwnerProfiles(ownerIds: readonly string[]) {
  const profiles: CommercialProfileRow[] = [];
  for (let start = 0; start < ownerIds.length; start += 100) {
    const ids = ownerIds.slice(start, start + 100);
    profiles.push(...await selectAllUserRows<CommercialProfileRow>("profiles", {
      select: "id,display_name",
      id: `in.(${ids.join(",")})`,
      order: "id.asc"
    }));
  }
  return profiles;
}

export function ownerNameById(profiles: readonly CommercialProfileRow[]) {
  return new Map(
    profiles.map((profile) => [
      profile.id,
      profile.display_name?.trim() || "Ej registrerat"
    ])
  );
}
