import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";

export default async function ProjectsPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const projects = await selectUserRows<OrganizationProject>("projects", {
      select:
        "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,access_level,created_by,assigned_to,created_at,updated_at",
    organization_id: `eq.${context.organization.id}`,
    deleted_at: "is.null",
    order: "updated_at.desc"
  });
  const canCreate = context.permissions.includes("project.create");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
            Projekt
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-ink-950">
            Organisationens projekt
          </h1>
          <p className="mt-2 text-sm text-ink-600">
            Endast projekt som din roll, teamtillhörighet och uttryckliga
            projektåtkomst tillåter visas.
          </p>
        </div>
        {canCreate && (
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nytt projekt
            </Button>
          </Link>
        )}
      </header>

      <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <FolderKanban className="h-8 w-8 text-ink-400" aria-hidden="true" />
            <h2 className="mt-3 font-semibold text-ink-950">
              Inga tillgängliga projekt
            </h2>
            <p className="mt-1 max-w-md text-sm text-ink-600">
              Det finns inga aktiva projekt som du har behörighet att se.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink-200 text-sm">
              <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Projekt</th>
                  <th className="px-5 py-3 font-semibold">Kund</th>
                  <th className="px-5 py-3 font-semibold">Åtkomst</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Uppdaterat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td className="px-5 py-4 font-semibold text-ink-950">
                      <Link href={`/projects/${project.id}`} className="hover:text-flow-700">
                        {project.name}
                        {project.project_number && (
                          <span className="mt-1 block text-xs font-normal text-ink-500">
                            {project.project_number}
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-ink-600">
                      {project.customer_name ?? "—"}
                    </td>
                    <td className="px-5 py-4 text-ink-600">
                      {project.access_level}
                    </td>
                    <td className="px-5 py-4 text-ink-600">{project.status}</td>
                    <td className="px-5 py-4 text-ink-500">
                      {new Intl.DateTimeFormat("sv-SE", {
                        dateStyle: "medium"
                      }).format(new Date(project.updated_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
