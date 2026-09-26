import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { PrimaryNavigation } from "@/components/PrimaryNavigation";
import type { OrganizationNavigationItem } from "@/lib/organization-navigation";
import type { OrganizationOption } from "@/types/organization";

export function Topbar({
  navigation, organizationName = "Scipx", activeOrganizationId, organizationOptions,
  userName = "Platform administrator", userEmail, roleLabel = "Internal administration"
}: {
  navigation?: readonly OrganizationNavigationItem[];
  organizationName?: string;
  activeOrganizationId?: string;
  organizationOptions?: readonly OrganizationOption[];
  userName?: string;
  userEmail?: string;
  roleLabel?: string;
}) {
  return (
    <header className="portal-topbar">
      <div className="portal-brandbar">
        <Link href={navigation?.[0]?.href ?? "/admin"} className="portal-brand" aria-label="Scipx startsida">
          <strong>scipx</strong><span>Ahlsell</span>
        </Link>
        <div className="portal-account">
          <span className="portal-account-label">{organizationName}</span>
          <span className="portal-account-label" title={roleLabel}>{userName}</span>
          <AccountMenu userName={userName} userEmail={userEmail} roleLabel={roleLabel}
            activeOrganizationId={activeOrganizationId} organizationOptions={organizationOptions} />
        </div>
      </div>
      <PrimaryNavigation navigation={navigation} />
    </header>
  );
}
