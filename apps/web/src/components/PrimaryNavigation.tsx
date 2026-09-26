"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, BarChart3, ClipboardCheck, FileJson, FileText, FolderKanban, Handshake, History, Home, PackageSearch, RefreshCw } from "lucide-react";
import type { OrganizationNavigationItem } from "@/lib/organization-navigation";

const icons = { home: Home, products: PackageSearch, projects: FolderKanban, history: History, statistics: BarChart3, crm: Handshake, technical_description: FileText };
const administration = [
  { name: "JSON Import", href: "/admin", icon: FileJson, exact: true },
  { name: "Till godkännande", href: "/admin/review", icon: ClipboardCheck, exact: true },
  { name: "Olästa datablad", href: "/admin/documents/failed", icon: AlertTriangle },
  { name: "Sprsok-synk", href: "/admin/sprsok", icon: RefreshCw },
  { name: "Products", href: "/products", icon: PackageSearch }
];

export function PrimaryNavigation({ navigation }: { navigation?: readonly OrganizationNavigationItem[] }) {
  const pathname = usePathname();
  const items = navigation
    ? navigation.map(item => ({ name: item.name, href: item.href, icon: icons[item.icon], exact: false }))
    : administration;
  return (
    <nav className="portal-navigation" aria-label="Huvudmeny">
      {items.map(item => {
        const Icon = item.icon;
        const path = item.href.split("#")[0];
        const active = pathname === path || (!item.exact && pathname.startsWith(`${path}/`));
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            <Icon aria-hidden="true" />{item.name}
          </Link>
        );
      })}
    </nav>
  );
}
