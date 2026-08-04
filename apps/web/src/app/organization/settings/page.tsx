import { OrganizationSettingsForm } from "@/components/OrganizationSettingsForm";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { Organization } from "@/types/organization";

type SubscriptionRow = { retention_days: number | null };

export default async function OrganizationSettingsPage() {
  const context = await getOrganizationContext();
  if (!context) return null;
  const canViewSubscription = context.permissions.includes("subscription.view");
  const [organization, subscriptions] = await Promise.all([
    selectUserRows<Organization>("organizations", {
      select: "id,name,organization_number,status,created_by,created_at,updated_at",
      id: `eq.${context.organization.id}`,
      limit: "1"
    }),
    canViewSubscription
      ? selectUserRows<SubscriptionRow>("organization_subscriptions", {
          select: "retention_days",
          organization_id: `eq.${context.organization.id}`,
          limit: "1"
        })
      : Promise.resolve([])
  ]);
  const activeOrganization = organization[0] ?? context.organization;
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">Organisation</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950">Organisationsinställningar</h1>
        <p className="mt-2 text-sm text-ink-600">Hantera grunduppgifter och datalagring för organisationen.</p>
      </header>
      <OrganizationSettingsForm
        organization={activeOrganization}
        retentionDays={subscriptions[0]?.retention_days ?? null}
        canUpdateOrganization={context.permissions.includes("organization.update")}
        canManageRetention={context.permissions.includes("subscription.manage")}
      />
    </div>
  );
}
