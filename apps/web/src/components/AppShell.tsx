import { Topbar } from "@/components/Topbar";
import type { OrganizationNavigationItem } from "@/lib/organization-navigation";
import type { OrganizationOption } from "@/types/organization";

export function AppShell({
  children,
  navigation,
  organizationName,
  activeOrganizationId,
  organizationOptions,
  userName,
  userEmail,
  roleLabel
}: {
  children: React.ReactNode;
  navigation?: readonly OrganizationNavigationItem[];
  organizationName?: string;
  activeOrganizationId?: string;
  organizationOptions?: readonly OrganizationOption[];
  userName?: string;
  userEmail?: string;
  roleLabel?: string;
}) {
  return (
    <div className="portal-workspace min-h-screen">
      <div>
        <Topbar
          navigation={navigation}
          organizationName={organizationName}
          activeOrganizationId={activeOrganizationId}
          organizationOptions={organizationOptions}
          userName={userName}
          userEmail={userEmail}
          roleLabel={roleLabel}
        />
        <main>{children}</main>
      </div>
    </div>
  );
}
