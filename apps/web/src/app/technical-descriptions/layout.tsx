import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";

export default function TechnicalDescriptionsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedAppShell
      anyPermissions={[
        "technical_description.view",
        "technical_description.create"
      ]}
    >
      {children}
    </AuthenticatedAppShell>
  );
}
