import Link from "next/link";
import { FolderKanban, History, Home } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { Badge } from "@/components/Badge";
import type { OrganizationNavigationItem } from "@/lib/organization-navigation";

const mobileIcons = {
  home: Home,
  projects: FolderKanban,
  history: History
} as const;

export function Topbar({
  navigation,
  organizationName = "Scipx",
  userName = "Platform administrator",
  userEmail,
  roleLabel = "Internal administration"
}: {
  navigation?: readonly OrganizationNavigationItem[];
  organizationName?: string;
  userName?: string;
  userEmail?: string;
  roleLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-semibold text-ink-900">{organizationName}</p>
          <p className="text-xs text-ink-500">Ahlsell produktval · Scipx-koncept</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block">
            <Badge tone="teal">{"S\u00e4ker anslutning"}</Badge>
          </span>
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
      </div>
      {navigation && navigation.length > 0 && (
        <nav aria-label="Huvudmeny" className="flex gap-1 overflow-x-auto border-t border-ink-100 px-3 py-2 lg:hidden">
          {navigation.map((item) => {
            const Icon = item.icon in mobileIcons
              ? mobileIcons[item.icon as keyof typeof mobileIcons]
              : FolderKanban;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold text-ink-700 hover:bg-ink-100 hover:text-[#00649e]"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
