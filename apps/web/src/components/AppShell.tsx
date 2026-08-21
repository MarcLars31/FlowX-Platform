import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import type { OrganizationNavigationItem } from "@/lib/organization-navigation";

export function AppShell({
  children,
  navigation,
  organizationName,
  userName,
  userEmail,
  roleLabel
}: {
  children: React.ReactNode;
  navigation?: readonly OrganizationNavigationItem[];
  organizationName?: string;
  userName?: string;
  userEmail?: string;
  roleLabel?: string;
}) {
  return (
    <div className="min-h-screen bg-ink-100">
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
          userName={userName}
          userEmail={userEmail}
          roleLabel={roleLabel}
        />
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
