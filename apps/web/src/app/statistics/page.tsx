import { BusinessDevelopmentDashboard } from "@/components/BusinessDevelopmentDashboard";
import { buildBusinessDevelopmentStatistics } from "@/lib/business-development-statistics";
import { loadCommercialProjectData } from "@/lib/commercial-project-data";
import { buildCommercialProjectInsights } from "@/lib/commercial-project-insights";
import { getOrganizationContext } from "@/lib/organization-context";

export default async function StatisticsPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const data = await loadCommercialProjectData(context, { includeProfiles: false });

  return (
    <BusinessDevelopmentDashboard
      organizationName={context.organization.name}
      businessStatistics={buildBusinessDevelopmentStatistics({
        requirements: data.requirements,
        assignments: data.assignments
      })}
      commercialInsights={buildCommercialProjectInsights({
        projects: data.projects,
        requirements: data.hasProductSelectionInsights ? data.requirements : [],
        assignments: data.assignments
      })}
      hasRequirementInsights={data.hasRequirementInsights}
      hasProductSelectionInsights={data.hasProductSelectionInsights}
    />
  );
}
