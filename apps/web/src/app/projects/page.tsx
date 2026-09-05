import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { ProjectListControls } from "@/components/ProjectListControls";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";

export default async function ProjectsPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const projects = await selectUserRows<OrganizationProject>("projects", {
      select:
        "id,organization_id,team_id,name,description,customer_name,project_number,end_customer,project_type,procurement_strategy,currency,delivery_country,warehouse_location,standard,system_type,supplier,status,current_stage,access_level,created_by,assigned_to,project_manager_id,demo_data_set_id,created_at,updated_at",
      organization_id: `eq.${context.organization.id}`,
      deleted_at: "is.null",
      order: "updated_at.desc"
    });
  const openProjects = projects.filter(
    (project) =>
      project.current_stage !== "completed" &&
      !["completed", "archived"].includes(project.status)
  );
  const canCreate = context.permissions.includes("project.create");
  const canDelete = context.permissions.includes("project.delete");

  return (
    <div className="space-y-6">
      <ScipxPageHeader
        eyebrow="Projekt"
        title="Pågående projekt"
        description="Här visas endast projekt som inte är färdiga. Markera ett eller flera projekt om du vill flytta dem till papperskorgen."
        icon={<FolderKanban aria-hidden="true" />}
      >
        {canCreate && (
          <Link
            href="/projects/new"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 text-base font-black text-[#03162d] transition hover:bg-cyan-300"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Ny teknisk analys
          </Link>
        )}
      </ScipxPageHeader>

      <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
        {openProjects.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <FolderKanban className="h-8 w-8 text-ink-400" aria-hidden="true" />
            <h2 className="mt-3 font-semibold text-ink-950">Inga pågående projekt</h2>
            <p className="mt-1 max-w-md text-sm text-ink-600">Ladda upp en teknisk beskrivning för att starta ett nytt projekt.</p>
          </div>
        ) : <ProjectListControls projects={openProjects} canDelete={canDelete} />}
      </section>
    </div>
  );
}
