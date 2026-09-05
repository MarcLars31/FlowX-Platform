import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { notFound } from "next/navigation";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";

const sections: Record<string, { title: string; description: string }> = {
  overview: { title: "Projektöversikt", description: "Samlad status, arbetssteg och nästa åtgärd." },
  settings: { title: "Projektinställningar", description: "Tekniska standarder och projektspecifika analysinställningar." },
  team: { title: "Projektteam", description: "Medlemmar och roller för projektet." },
  documents: { title: "Dokument", description: "Uppladdade projektunderlag och extraktionsstatus." },
  "technical-description": { title: "Teknisk beskrivning", description: "Versionerade tekniska beskrivningar och extraherade produktrader." },
  analysis: { title: "Analys", description: "Analyskörningar och eventuella inaktuella resultat." },
  "product-matching": { title: "Ahlsells produktval", description: "Manuella produkt- och tillbehörsval direkt från extraherade produktrader." },
  "material-list": { title: "Materiallista", description: "Materiallistor och godkända versioner." },
  exports: { title: "Export", description: "Exporter kan skapas efter godkänd materiallista." },
  activity: { title: "Aktivitet", description: "Projektets audit-logg och historik." }
};

type Props = { params: Promise<{ id: string; section: string }> };

export default async function ProjectSectionPage({ params }: Props) {
  const context = await getOrganizationContext();
  if (!context) return null;
  const { id, section } = await params;
  const definition = sections[section];
  if (!definition) notFound();

  const [project] = await selectUserRows<OrganizationProject>("projects", {
    select: "id,name,project_number,customer_name,status,current_stage,organization_id",
    id: `eq.${id}`,
    organization_id: `eq.${context.organization.id}`,
    deleted_at: "is.null",
    limit: "1"
  });
  if (!project) notFound();

  return (
    <div className="space-y-6">
      <ScipxPageHeader
        eyebrow={project.project_number ?? "Projekt"}
        title={definition.title}
        description={definition.description}
        icon={<FolderKanban aria-hidden="true" />}
      >
        <Link href={`/projects/${id}`} className="inline-flex min-h-11 items-center rounded-lg border border-white/20 bg-white/10 px-4 text-sm font-bold text-white transition hover:border-cyan-300/60 hover:bg-white/15">← Till projektet</Link>
      </ScipxPageHeader>
      <section className="rounded-2xl border border-cyan-900/10 bg-white p-6 shadow-sm">
        <div className="rounded-lg bg-ink-50 p-5">
          <p className="font-semibold text-ink-950">{project.name}</p>
          <p className="mt-1 text-sm text-ink-600">{project.customer_name ?? "Ingen kund angiven"} · {project.status} · {project.current_stage ?? "setup"}</p>
        </div>
        <p className="mt-5 text-sm text-ink-600">Den här projektytan använder samma behörighetskontroller som projektöversikten. Funktionerna aktiveras stegvis och servern blockerar alltid åtgärder som saknar underlag.</p>
      </section>
    </div>
  );
}
