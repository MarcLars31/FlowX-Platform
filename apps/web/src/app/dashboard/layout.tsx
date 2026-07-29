import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
