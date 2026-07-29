"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

const standardRoles = [
  { value: "full_user", label: "Full användare" },
  { value: "mini_user", label: "Mini-användare" },
  { value: "read_only", label: "Läsanvändare" }
];

export function OrganizationInviteForm({ canAssignAdmins }: {
  canAssignAdmins: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const roles = canAssignAdmins
    ? [
        { value: "organization_admin", label: "Organisationsadmin" },
        ...standardRoles
      ]
    : standardRoles;

  return (
    <form
      className="grid gap-4 rounded-lg border border-ink-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_240px_auto]"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage(null);
        const form = event.currentTarget;
        const formData = new FormData(form);
        const response = await fetch("/api/organizations/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.get("email"),
            role: formData.get("role")
          })
        });
        const result = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;

        if (!response.ok) {
          setMessage(result?.error ?? "Inbjudan kunde inte skapas.");
          setSaving(false);
          return;
        }

        form.reset();
        setMessage(
          "Inbjudan är säkert registrerad. E-postleverans kopplas in i nästa fas."
        );
        setSaving(false);
        router.refresh();
      }}
    >
      <Input
        id="invitation-email"
        name="email"
        type="email"
        label="E-postadress"
        required
      />
      <label className="block" htmlFor="invitation-role">
        <span className="mb-2 block text-sm font-medium text-ink-700">Roll</span>
        <select
          id="invitation-role"
          name="role"
          className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
        >
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <Button type="submit" disabled={saving} className="w-full justify-center">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          Bjud in
        </Button>
      </div>
      {message && (
        <p className="text-sm text-ink-600 md:col-span-3">{message}</p>
      )}
    </form>
  );
}
