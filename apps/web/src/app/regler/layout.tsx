import { AppShell } from "@/components/AppShell";
import { AuthenticatedAppShell } from "@/components/AuthenticatedAppShell";
import { ORGANIZATION_NAVIGATION } from "@/lib/organization-navigation";

export default function RulesLayout({ children }: { children: React.ReactNode }) {
  // Explicit local preview only. This never bypasses authentication in a production build.
  if (process.env.NODE_ENV === "development" && process.env.SCIPX_RULES_PREVIEW === "1") {
    return <AppShell navigation={ORGANIZATION_NAVIGATION} organizationName="Testmiljö" userName="Förhandsvisning" roleLabel="Läsvy för regler">{children}</AppShell>;
  }
  return <AuthenticatedAppShell anyPermissions={["project.product_suggestion.view"]}>{children}</AuthenticatedAppShell>;
}
