"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { demoFlowPages } from "@/lib/mock-data";

export function DemoFlowNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Demo flow"
      className="rounded-lg border border-ink-200 bg-white p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        {demoFlowPages.map((page, index) => {
          const isActive = pathname === page.href;

          return (
            <div key={page.href} className="flex items-center gap-2">
              <Link
                href={page.href}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold transition",
                  isActive
                    ? "bg-flow-600 text-white"
                    : "text-ink-600 hover:bg-ink-100 hover:text-ink-950"
                )}
              >
                {page.label}
              </Link>
              {index < demoFlowPages.length - 1 && (
                <ChevronRight
                  className="h-4 w-4 text-ink-300"
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
