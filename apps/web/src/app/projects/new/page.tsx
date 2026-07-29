"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";

export default function CreateProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessLevel, setAccessLevel] = useState("own");
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let active = true;

    fetch("/api/teams", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return [];
        const result = (await response.json()) as {
          teams?: Array<{ id: string; name: string }>;
        };
        return result.teams ?? [];
      })
      .then((items) => {
        if (active) setTeams(items);
      })
      .catch(() => {
        if (active) setTeams([]);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Projects
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal text-ink-950">
          Create Project
        </h1>
      </div>

      <form
        className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm sm:p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError(null);

          const formData = new FormData(event.currentTarget);
          const response = await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: formData.get("name"),
              customerName: formData.get("customerName"),
              address: formData.get("address"),
              country: formData.get("country"),
              standard: formData.get("standard"),
              systemType: formData.get("systemType"),
              supplier: formData.get("supplier"),
              accessLevel: formData.get("accessLevel"),
              teamId:
                formData.get("accessLevel") === "team"
                  ? formData.get("teamId")
                  : null
            })
          });
          const result = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;

          if (!response.ok) {
            setError(result?.error ?? "Projektet kunde inte sparas.");
            setSaving(false);
            return;
          }

          router.push("/projects");
          router.refresh();
        }}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Input
            id="project-name"
            name="name"
            label="Project name"
            required
          />
          <Input id="customer" name="customerName" label="Customer" />
          <Input
            id="address"
            name="address"
            label="Address"
          />
          <Select
            id="country"
            name="country"
            label="Country"
            options={["Norway", "Sweden", "Denmark", "Finland"]}
            defaultValue="Norway"
          />
          <Select
            id="standard"
            name="standard"
            label="Standard"
            options={["NS-EN 12845", "SS-EN 12845", "DBI 251", "SFS-EN 12845"]}
            defaultValue="NS-EN 12845"
          />
          <Select
            id="system-type"
            name="systemType"
            label="System type"
            options={[
              "Wet sprinkler system",
              "Dry sprinkler system",
              "ESFR sprinkler system",
              "Pre-action sprinkler system"
            ]}
            defaultValue="Wet sprinkler system"
          />
          <Select
            id="preferred-supplier"
            name="supplier"
            label="Preferred supplier"
            options={["Ahlsell", "Dahl", "Broedrene Dahl", "Onninen"]}
            defaultValue="Ahlsell"
          />
          <label className="block" htmlFor="access-level">
            <span className="mb-2 block text-sm font-medium text-ink-700">
              Projektåtkomst
            </span>
            <select
              id="access-level"
              name="accessLevel"
              value={accessLevel}
              onChange={(event) => setAccessLevel(event.target.value)}
              className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
            >
              <option value="own">Skapare och tilldelade användare</option>
              {teams.length > 0 && (
                <option value="team">Mitt team</option>
              )}
              <option value="organization">Hela organisationen</option>
              <option value="restricted">Endast utvalda användare</option>
            </select>
          </label>
          {accessLevel === "team" && (
            <label className="block" htmlFor="team-id">
              <span className="mb-2 block text-sm font-medium text-ink-700">
                Team
              </span>
              <select
                id="team-id"
                name="teamId"
                required
                className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && (
          <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Sparar…" : "Skapa projekt"}
          </Button>
        </div>
      </form>
    </div>
  );
}
