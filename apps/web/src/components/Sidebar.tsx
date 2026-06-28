"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  PackageSearch,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects/demo", icon: FolderKanban },
  { name: "Products", href: "/products", icon: PackageSearch },
  {
    name: "Material Lists",
    href: "/projects/demo/material-list",
    icon: ClipboardList
  },
  { name: "AI Assistant", href: "/projects/demo#assistant", icon: Bot },
  { name: "Settings", href: "/dashboard", icon: Settings }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-full flex-col bg-ink-950 text-white">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-flow-400 text-sm font-black text-ink-950">
          FX
        </div>
        <div>
          <p className="text-base font-semibold leading-5">FlowX</p>
          <p className="text-xs text-ink-400">Platform</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const Icon = item.icon;
          const hrefPath = item.href.split("#")[0];
          const isActive =
            pathname === hrefPath ||
            (hrefPath !== "/dashboard" && pathname.startsWith(hrefPath));

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
          <p className="text-sm font-medium text-white">Demo VVS AS</p>
          <p className="mt-1 text-xs text-ink-400">Prototype workspace</p>
        </div>
      </div>
    </aside>
  );
}
