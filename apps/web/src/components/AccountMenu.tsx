"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  LoaderCircle,
  LogOut,
  Settings,
  UserRound
} from "lucide-react";
import type { OrganizationOption } from "@/types/organization";

export function AccountMenu({
  userName,
  userEmail,
  roleLabel,
  activeOrganizationId,
  organizationOptions = []
}: {
  userName: string;
  userEmail?: string;
  roleLabel?: string;
  activeOrganizationId?: string;
  organizationOptions?: readonly OrganizationOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
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

  async function switchOrganization(organizationId: string) {
    if (!organizationId || organizationId === activeOrganizationId) return;

    setIsSwitching(true);
    setSwitchError(null);

    try {
      const response = await fetch("/api/organizations/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId })
      });

      if (!response.ok) {
        throw new Error("Det gick inte att byta organisation.");
      }

      setIsOpen(false);
      window.location.assign("/dashboard");
    } catch (error) {
      setSwitchError(
        error instanceof Error
          ? error.message
          : "Det gick inte att byta organisation."
      );
    } finally {
      setIsSwitching(false);
    }
  }

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

          {organizationOptions.length > 1 && (
            <div className="border-b border-ink-100 px-4 py-3">
              <label
                htmlFor="account-organization"
                className="flex items-center gap-2 text-xs font-semibold text-ink-700"
              >
                <Building2
                  className="h-4 w-4 text-flow-700"
                  aria-hidden="true"
                />
                Organisation
              </label>
              <div className="relative mt-2">
                <select
                  id="account-organization"
                  value={activeOrganizationId}
                  disabled={isSwitching}
                  onChange={(event) =>
                    void switchOrganization(event.target.value)
                  }
                  className="min-h-10 w-full appearance-none rounded-md border border-ink-200 bg-white px-3 pr-9 text-sm font-medium text-ink-900 outline-none transition focus:border-flow-500 focus:ring-2 focus:ring-flow-100 disabled:cursor-wait disabled:bg-ink-50"
                >
                  {organizationOptions.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
                </select>
                {isSwitching && (
                  <LoaderCircle
                    className="pointer-events-none absolute right-3 top-3 h-4 w-4 animate-spin text-flow-700"
                    aria-hidden="true"
                  />
                )}
              </div>
              {switchError && (
                <p role="alert" className="mt-2 text-xs text-rose-700">
                  {switchError}
                </p>
              )}
            </div>
          )}

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
