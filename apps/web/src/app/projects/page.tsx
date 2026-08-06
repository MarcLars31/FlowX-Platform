import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { ProjectListControls } from "@/components/ProjectListControls";
import { getOrganizationContext } from "@/lib/organization-context";
import { getCurrentUser } from "@/lib/supabase-auth";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";

export default async function ProjectsPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const [projects, user] = await Promise.all([
    selectUserRows<OrganizationProject>("projects", {
      select:
        "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,current_stage,access_level,created_by,assigned_to,project_manager_id,demo_data_set_id,created_at,updated_at",
      organization_id: `eq.${context.organization.id}`,
      deleted_at: "is.null",
      order: "updated_at.desc"
    }),
    getCurrentUser()
  ]);
  const canCreate = context.permissions.includes("project.create");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">Projekt</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink-950">Organisationens projekt</h1>
          <p className="mt-2 text-sm text-ink-600">Projektlistan visar endast projekt som din organisation och projektåtkomst tillåter.</p>
        </div>
        {canCreate && <Link href="/projects/new"><Button><Plus className="h-4 w-4" aria-hidden="true" />Nytt projekt</Button></Link>}
      </header>

      <section className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-sm">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <FolderKanban className="h-8 w-8 text-ink-400" aria-hidden="true" />
            <h2 className="mt-3 font-semibold text-ink-950">Inga tillgängliga projekt</h2>
            <p className="mt-1 max-w-md text-sm text-ink-600">Skapa ditt första projekt för att börja arbeta project-first.</p>
          </div>
        ) : user ? <ProjectListControls projects={projects} currentUserId={user.id} /> : null}
      </section>
    </div>
  );
}
