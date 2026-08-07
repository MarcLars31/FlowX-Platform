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
  const [catalogOptions, setCatalogOptions] = useState<{
    manufacturers: Array<{ id: string; name: string }>;
    distributors: Array<{ id: string; name: string }>;
  }>({ manufacturers: [], distributors: [] });
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      fetch("/api/teams", { cache: "no-store" }),
      fetch("/api/projects/options", { cache: "no-store" })
    ])
      .then(async ([teamResponse, optionsResponse]) => {
        const teamResult = teamResponse.ok
          ? await teamResponse.json() as { teams?: Array<{ id: string; name: string }> }
          : {};
        if (!optionsResponse.ok) throw new Error("Projektvalen kunde inte hämtas.");
        const optionResult = await optionsResponse.json() as {
          manufacturers?: Array<{ id: string; name: string }>;
          distributors?: Array<{ id: string; name: string }>;
        };
        return { teamResult, optionResult };
      })
      .then(({ teamResult, optionResult }) => {
        if (!active) return;
        setTeams(teamResult.teams ?? []);
        setCatalogOptions({
          manufacturers: optionResult.manufacturers ?? [],
          distributors: optionResult.distributors ?? []
        });
      })
      .catch(() => {
        if (!active) return;
        setTeams([]);
        setError("Leverantörer och distributörer kunde inte laddas från demodatabasen.");
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
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
              projectNumber: formData.get("projectNumber"),
              customerName: formData.get("customerName"),
              endCustomer: formData.get("endCustomer"),
              address: formData.get("address"),
              country: formData.get("country"),
              standard: formData.get("standard"),
              systemType: formData.get("systemType"),
              manufacturer: formData.get("manufacturer"),
              distributor: formData.get("distributor"),
              projectType: formData.get("projectType"),
              procurementStrategy: formData.get("procurementStrategy"),
              currency: formData.get("currency"),
              deliveryCountry: formData.get("deliveryCountry"),
              warehouseLocation: formData.get("warehouseLocation"),
              expectedStartDate: formData.get("expectedStartDate"),
              expectedDeliveryDate: formData.get("expectedDeliveryDate"),
              description: formData.get("description"),
              internalComments: formData.get("internalComments"),
              accessLevel: formData.get("accessLevel"),
              teamId:
                formData.get("accessLevel") === "team"
                  ? formData.get("teamId")
                  : null
            })
          });
          const result = (await response.json().catch(() => null)) as
            | { error?: string; project?: { id: string } }
            | null;

          if (!response.ok) {
            setError(result?.error ?? "Projektet kunde inte sparas.");
            setSaving(false);
            return;
          }

          router.push(result?.project?.id ? `/projects/${result.project.id}` : "/projects");
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
          <Input id="project-number" name="projectNumber" label="Project number" />
          <Input id="customer" name="customerName" label="Customer" required />
          <Input id="end-customer" name="endCustomer" label="End customer" />
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
            id="project-type"
            name="projectType"
            label="Project type"
            options={[
              "New construction",
              "Reconstruction",
              "Renovation",
              "Tenant adaptation",
              "Replacement",
              "Service project",
              "Calculation project",
              "Design project",
              "Procurement project"
            ]}
            defaultValue="New construction"
          />
          <Select
            id="procurement-strategy"
            name="procurementStrategy"
            label="Procurement strategy"
            options={[
              "Preferred manufacturer only",
              "Preferred with approved alternatives",
              "Lowest price",
              "Shortest lead time",
              "Best technical match",
              "Best total economy",
              "Standardized range",
              "Free product selection"
            ]}
            defaultValue="Preferred with approved alternatives"
          />
          <Select
            id="preferred-manufacturer"
            name="manufacturer"
            label="Föredragen tillverkare"
            options={catalogOptions.manufacturers.map((item) => ({ value: item.name, label: item.name }))}
            placeholder={loadingOptions ? "Laddar tillverkare…" : "Välj tillverkare"}
            disabled={loadingOptions || catalogOptions.manufacturers.length === 0}
          />
          <Select
            id="preferred-distributor"
            name="distributor"
            label="Föredragen distributör"
            options={catalogOptions.distributors.map((item) => ({ value: item.name, label: item.name }))}
            placeholder={loadingOptions ? "Laddar distributörer…" : "Välj distributör"}
            disabled={loadingOptions || catalogOptions.distributors.length === 0}
          />
          <Input id="currency" name="currency" label="Currency" defaultValue="NOK" />
          <Input
            id="delivery-country"
            name="deliveryCountry"
            label="Delivery country"
            defaultValue="Norway"
          />
          <Input id="warehouse" name="warehouseLocation" label="Warehouse / distribution point" />
          <Input id="expected-start" name="expectedStartDate" label="Expected start" type="date" />
          <Input id="expected-delivery" name="expectedDeliveryDate" label="Expected delivery" type="date" />
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

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="block" htmlFor="project-description">
            <span className="mb-2 block text-sm font-medium text-ink-700">Project description</span>
            <textarea
              id="project-description"
              name="description"
              rows={4}
              className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
            />
          </label>
          <label className="block" htmlFor="internal-comments">
            <span className="mb-2 block text-sm font-medium text-ink-700">Internal comments</span>
            <textarea
              id="internal-comments"
              name="internalComments"
              rows={4}
              className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500"
            />
          </label>
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
