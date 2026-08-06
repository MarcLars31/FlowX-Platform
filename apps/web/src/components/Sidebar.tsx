"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Building2,
  ClipboardCheck,
  FileJson,
  FileText,
  FolderKanban,
  Home,
  PackageSearch,
  RefreshCw,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrganizationNavigationItem } from "@/lib/organization-navigation";

type SidebarItem = {
  name: string;
  href: string;
  icon: typeof Home;
  exact?: boolean;
};

const adminNavigation: SidebarItem[] = [
  { name: "JSON Import", href: "/admin", icon: FileJson, exact: true },
  {
    name: "Till godkännande",
    href: "/admin/review",
    icon: ClipboardCheck,
    exact: true
  },
  {
    name: "Olästa datablad",
    href: "/admin/documents/failed",
    icon: AlertTriangle
  },
  { name: "Sprsok-synk", href: "/admin/sprsok", icon: RefreshCw },
  { name: "Products", href: "/products", icon: PackageSearch }
];

const organizationIcons = {
  home: Home,
  products: PackageSearch,
  projects: FolderKanban,
  organization: Building2,
  trash: Trash2,
  activity: Activity,
  technical_description: FileText
} satisfies Record<OrganizationNavigationItem["icon"], typeof Home>;

export function Sidebar({
  navigation,
  workspaceName = "Scipx",
  workspaceLabel = "Platform"
}: {
  navigation?: readonly OrganizationNavigationItem[];
  workspaceName?: string;
  workspaceLabel?: string;
}) {
  const pathname = usePathname();
  const items: SidebarItem[] = navigation
    ? navigation.map((item) => ({
        name: item.name,
        href: item.href,
        icon: organizationIcons[item.icon]
      }))
    : adminNavigation;

  return (
    <aside className="flex h-full w-full flex-col bg-ink-950 text-white">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-flow-400 text-sm font-black text-ink-950">
          SX
        </div>
        <div>
          <p className="max-w-40 truncate text-base font-semibold leading-5">
            {workspaceName}
          </p>
          <p className="text-xs text-ink-400">{workspaceLabel}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = item.icon;
          const hrefPath = item.href.split("#")[0];
          const isActive = item.exact
            ? pathname === hrefPath
            : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-300 transition hover:bg-white/8 hover:text-white",
                isActive && "bg-white/10 text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-lg bg-white/6 p-3">
          <p className="truncate text-sm font-medium text-white">
            {workspaceName}
          </p>
          <p className="mt-1 text-xs text-ink-400">{workspaceLabel}</p>
        </div>
      </div>
    </aside>
  );
}
