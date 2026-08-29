import { Sidebar } from "@/components/Sidebar";
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
    <div className="min-h-screen bg-[#eaf1f6] [background-image:linear-gradient(rgba(20,94,126,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(20,94,126,0.045)_1px,transparent_1px)] [background-size:32px_32px]">
      <div className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar
          navigation={navigation}
          workspaceName={organizationName}
          workspaceLabel={roleLabel}
        />
      </div>
      <div className="lg:pl-64">
        <Topbar
          navigation={navigation}
          organizationName={organizationName}
          activeOrganizationId={activeOrganizationId}
          organizationOptions={organizationOptions}
          userName={userName}
          userEmail={userEmail}
          roleLabel={roleLabel}
        />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
