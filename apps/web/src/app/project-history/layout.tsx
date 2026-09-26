import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";

export default function ProjectHistoryLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedAppShell
      anyPermissions={[
        "project.view_own",
        "project.view_team",
        "project.view_organization",
        "project.view_all"
      ]}
    >
      {children}
    </AuthenticatedAppShell>
  );
}
