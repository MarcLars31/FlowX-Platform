import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";

export default function SettingsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
