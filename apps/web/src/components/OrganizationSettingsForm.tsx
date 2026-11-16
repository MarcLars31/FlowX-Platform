"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";

export function OrganizationSettingsForm({
  organization,
  retentionDays,
  canUpdateOrganization,
  canManageRetention
}: {
  organization: { name: string; organization_number?: string | null };
  retentionDays: number | null;
  canUpdateOrganization: boolean;
  canManageRetention: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(form: HTMLFormElement) {
    setSaving(true);
    setError(null);
    setMessage(null);
    const data = new FormData(form);
    const payload: Record<string, unknown> = {};
    if (canUpdateOrganization) {
      payload.name = data.get("name");
      payload.organizationNumber = data.get("organizationNumber");
    }
    if (canManageRetention) payload.retentionDays = data.get("retentionDays");
    try {
      const response = await fetch("/api/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Inställningarna kunde inte sparas.");
      setMessage("Inställningarna är sparade.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Inställningarna kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-6 rounded-lg border border-ink-200 bg-white p-5 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        void save(event.currentTarget);
      }}
    >
      <div>
        <h2 className="font-semibold text-ink-950">Organisation</h2>
        <p className="mt-1 text-sm text-ink-600">Ändringar sparas direkt i den aktiva organisationen.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Input id="organization-settings-name" name="name" label="Organisationsnamn" defaultValue={organization.name} disabled={!canUpdateOrganization || saving} required />
        <Input id="organization-settings-number" name="organizationNumber" label="Organisationsnummer" defaultValue={organization.organization_number ?? ""} disabled={!canUpdateOrganization || saving} />
      </div>
      {canManageRetention && (
        <div className="border-t border-ink-100 pt-5">
          <h2 className="font-semibold text-ink-950">Retention för papperskorgen</h2>
          <p className="mt-1 text-sm text-ink-600">Antal dagar innan projekt kan raderas permanent. 0 betyder omedelbart. Ingen automatisk radering körs ännu.</p>
          <div className="mt-4 max-w-xs">
            <Input id="organization-settings-retention" name="retentionDays" label="Dagar" type="number" min={0} max={3650} defaultValue={retentionDays ?? ""} disabled={saving} placeholder="Ej konfigurerad" />
          </div>
        </div>
      )}
      {(message || error) && <p className={error ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>{error ?? message}</p>}
      {(canUpdateOrganization || canManageRetention) && <Button type="submit" disabled={saving}>{saving ? "Sparar…" : "Spara inställningar"}</Button>}
    </form>
  );
}
