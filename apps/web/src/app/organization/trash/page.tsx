import { OrganizationTrashActions } from "@/components/OrganizationTrashActions";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";

export default async function TrashPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const projects = await selectUserRows<OrganizationProject>("projects", {
    select:
      "id,organization_id,name,status,deleted_at,deleted_by,deletion_reason,created_at,updated_at,access_level",
    organization_id: `eq.${context.organization.id}`,
    deleted_at: "not.is.null",
    order: "deleted_at.desc"
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
          Projekt
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-950">Papperskorg</h1>
        <p className="mt-2 text-sm text-ink-600">
          Ingen automatisk permanent radering sker utan en konfigurerad
          retention-policy.
        </p>
      </header>
      <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-200 text-sm">
            <thead className="bg-ink-50 text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="px-5 py-3">Projekt</th>
                <th className="px-5 py-3">Borttaget</th>
                <th className="px-5 py-3">Anledning</th>
                <th className="px-5 py-3">Retention</th>
                <th className="px-5 py-3">Åtgärder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-5 py-4 font-medium text-ink-950">
                    {project.name}
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {project.deleted_at
                      ? new Intl.DateTimeFormat("sv-SE", {
                          dateStyle: "medium",
                          timeStyle: "short"
                        }).format(new Date(project.deleted_at))
                      : "—"}
                  </td>
                  <td className="px-5 py-4 text-ink-600">
                    {project.deletion_reason ?? "—"}
                  </td>
                  <td className="px-5 py-4 text-ink-500">
                    Ej konfigurerad
                  </td>
                  <td className="px-5 py-4">
                    <OrganizationTrashActions
                      projectId={project.id}
                      projectName={project.name}
                      canRestore={context.permissions.includes("project.restore")}
                      canPermanentlyDelete={context.permissions.includes(
                        "project.permanent_delete"
                      )}
                    />
                  </td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-ink-500">
                    Papperskorgen är tom.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
