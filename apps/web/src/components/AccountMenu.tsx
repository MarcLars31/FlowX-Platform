"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, UserRound } from "lucide-react";

export function AccountMenu({
  userName,
  userEmail,
  roleLabel
}: {
  userName: string;
  userEmail?: string;
  roleLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "SX";

  useEffect(() => {
    if (!isOpen) return;

    function closeWhenClickingOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", closeWhenClickingOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeWhenClickingOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="Open account menu"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400 text-sm font-black text-[#03162d] transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
      >
        {initials}
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-label="Kontomeny"
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xl"
        >
          <div className="border-b border-ink-100 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-900">{userName}</p>
            {userEmail && (
              <p className="mt-0.5 truncate text-xs text-ink-500">{userEmail}</p>
            )}
            {roleLabel && (
              <p className="mt-2 text-xs font-medium text-flow-700">{roleLabel}</p>
            )}
          </div>

          <div className="p-1.5">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-ink-700 transition hover:bg-ink-100 hover:text-ink-950"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              {"Inst\u00e4llningar"}
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-ink-700 transition hover:bg-ink-100 hover:text-ink-950"
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              {"Min profil"}
            </Link>
          </div>

          <div className="border-t border-ink-100 p-1.5">
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                role="menuitem"
                className="flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50 hover:text-rose-800"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {"Logga ut"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
