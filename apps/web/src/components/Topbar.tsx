import Link from "next/link";
import { BarChart3, FolderKanban, History, Home } from "lucide-react";
import { AccountMenu } from "@/components/AccountMenu";
import { Badge } from "@/components/Badge";
import type { OrganizationNavigationItem } from "@/lib/organization-navigation";

const mobileIcons = {
  home: Home,
  projects: FolderKanban,
  history: History,
  statistics: BarChart3
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
    <header className="sticky top-0 z-20 border-b border-cyan-300/15 bg-[#03162d]/95 text-white backdrop-blur">
      <div className="flex min-h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm font-bold text-white">{organizationName}</p>
          <p className="text-xs text-slate-400">Ahlsell produktval · Scipx-koncept</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block">
            <Badge tone="teal">{"S\u00e4ker anslutning"}</Badge>
          </span>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-white">{userName}</p>
            <p className="text-xs text-slate-400">{roleLabel}</p>
          </div>
          <AccountMenu
            userName={userName}
            userEmail={userEmail}
            roleLabel={roleLabel}
          />
        </div>
      </div>
      {navigation && navigation.length > 0 && (
        <nav aria-label="Huvudmeny" className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2 lg:hidden">
          {navigation.map((item) => {
            const Icon = item.icon in mobileIcons
              ? mobileIcons[item.icon as keyof typeof mobileIcons]
              : FolderKanban;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-bold text-slate-200 hover:bg-white/10 hover:text-cyan-300"
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
