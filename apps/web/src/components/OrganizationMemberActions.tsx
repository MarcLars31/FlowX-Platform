"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrganizationRoleSlug } from "@/lib/organization-rbac";

const roleOptions: { value: OrganizationRoleSlug; label: string }[] = [
  { value: "organization_owner", label: "Organisationsägare" },
  { value: "company_admin", label: "Företagsadministratör" },
  { value: "project_manager", label: "Projektledare" },
  { value: "engineer", label: "Ingenjör" },
  { value: "viewer", label: "Läsbehörighet" },
  { value: "organization_admin", label: "Organisationsadmin" },
  { value: "full_user", label: "Full användare" },
  { value: "mini_user", label: "Mini-användare" },
  { value: "read_only", label: "Läsanvändare" }
];

const statusOptions = [
  { value: "active", label: "Aktiv" },
  { value: "suspended", label: "Pausad" },
  { value: "disabled", label: "Inaktiverad" }
] as const;

export function OrganizationMemberActions({
  memberId,
  currentRole,
  currentStatus,
  canChangeRole,
  canChangeStatus,
  canAssignPrivilegedRoles,
  disabled
}: {
  memberId: string;
  currentRole: OrganizationRoleSlug;
  currentStatus: string;
  canChangeRole: boolean;
  canChangeStatus: boolean;
  canAssignPrivilegedRoles: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<"role" | "status" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (disabled || (!canChangeRole && !canChangeStatus)) {
    return <span className="text-xs text-ink-400">—</span>;
  }

  const roles = canAssignPrivilegedRoles
    ? roleOptions
    : roleOptions.filter(
        (role) =>
          role.value === currentRole ||
          [
            "project_manager",
            "engineer",
            "viewer",
            "full_user",
            "mini_user",
            "read_only"
          ].includes(role.value)
      );

  async function update(path: string, body: Record<string, string>, kind: "role" | "status") {
    setSaving(kind);
    setMessage(null);
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; detail?: string }
      | null;
    if (!response.ok) {
      setMessage(result?.detail ?? result?.error ?? "Ändringen kunde inte sparas.");
      setSaving(null);
      return;
    }
    setSaving(null);
    router.refresh();
  }

  return (
    <div className="flex min-w-[230px] flex-col gap-2">
      {canChangeRole && (
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <span className="sr-only">Roll</span>
          <select
            defaultValue={currentRole}
            disabled={saving !== null}
            className="h-9 min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2 text-xs"
            onChange={(event) =>
              void update(
                `/api/organizations/members/${memberId}/role`,
                { role: event.target.value },
                "role"
              )
            }
          >
            {roles.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
          {saving === "role" && <span>…</span>}
        </label>
      )}
      {canChangeStatus && (
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <span className="sr-only">Status</span>
          <select
            defaultValue={currentStatus}
            disabled={saving !== null}
            className="h-9 min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2 text-xs"
            onChange={(event) =>
              void update(
                `/api/organizations/members/${memberId}/status`,
                { status: event.target.value },
                "status"
              )
            }
          >
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          {saving === "status" && <span>…</span>}
        </label>
      )}
      {message && <p className="text-xs text-rose-600">{message}</p>}
    </div>
  );
}
