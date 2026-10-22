import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";

export default function OrganizationLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedAppShell
      anyPermissions={[
        "organization.update",
        "member.view",
        "team.view",
        "subscription.view",
        "audit_log.view",
        "project.restore"
      ]}
    >
      {children}
    </AuthenticatedAppShell>
  );
}
