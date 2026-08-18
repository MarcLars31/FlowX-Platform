import { AccountMenu } from "@/components/AccountMenu";
import { Badge } from "@/components/Badge";

export function Topbar({
  organizationName = "Scipx",
  userName = "Platform administrator",
  userEmail,
  roleLabel = "Internal administration"
}: {
  organizationName?: string;
  userName?: string;
  userEmail?: string;
  roleLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-ink-200 bg-white/92 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div>
        <p className="text-sm font-semibold text-ink-900">{organizationName}</p>
        <p className="text-xs text-ink-500">Ahlsell produktval · Scipx-koncept</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge tone="teal">{"S\u00e4ker anslutning"}</Badge>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium text-ink-900">{userName}</p>
          <p className="text-xs text-ink-500">{roleLabel}</p>
        </div>
        <AccountMenu
          userName={userName}
          userEmail={userEmail}
          roleLabel={roleLabel}
        />
      </div>
    </header>
  );
}
