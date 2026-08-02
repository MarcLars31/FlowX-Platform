import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  getOrganizationContext,
  organizationHasAnyPermission
} from "@/lib/organization-context";
import { filterOrganizationNavigation } from "@/lib/organization-navigation";
import { getCurrentUser } from "@/lib/supabase-auth";
import { isPlatformAdmin } from "@/lib/platform-role";
import type { PermissionKey } from "@/lib/organization-rbac";

export async function AuthenticatedAppShell({
  children,
  anyPermissions = []
}: {
  children: React.ReactNode;
  anyPermissions?: readonly PermissionKey[];
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/");

  const userName =
    user.user_metadata?.full_name?.trim() ||
    user.email?.split("@")[0] ||
    "Scipx-användare";

  if (isPlatformAdmin(user)) {
    return (
      <AppShell userName={userName} roleLabel="Plattformsadministratör">
        {children}
      </AppShell>
    );
  }

  const context = await getOrganizationContext();
  if (!context) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-semibold text-ink-950">
            Ingen aktiv organisation
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-700">
            Kontot är autentiserat men saknar ett aktivt
            organisationsmedlemskap. En Scipx-administratör eller
            organisationsägare behöver aktivera medlemskapet.
          </p>
        </div>
      </main>
    );
  }

  if (
    anyPermissions.length > 0 &&
    !organizationHasAnyPermission(context, anyPermissions)
  ) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      navigation={filterOrganizationNavigation(context.permissions)}
      organizationName={context.organization.name}
      userName={userName}
      roleLabel={formatRole(context.membership.role_slug)}
    >
      {children}
    </AppShell>
  );
}

function formatRole(role: string) {
  const labels: Record<string, string> = {
    organization_owner: "Organisationsägare",
    organization_admin: "Organisationsadmin",
    full_user: "Full användare",
    mini_user: "Mini-användare",
    read_only: "Läsanvändare"
  };

  return labels[role] ?? role;
}
