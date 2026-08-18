import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  ClipboardCheck,
  FileUp,
  FolderKanban,
  PackageCheck
} from "lucide-react";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";

type MemoryRow = {
  id: string;
  product_name: string;
  product_number: string;
  manufacturer_name: string | null;
  requirement_key: string;
  usage_count: number;
  last_used_at: string;
};

export default async function DashboardPage() {
  const context = await getOrganizationContext();
  if (!context) return null;
  const canViewProjects = context.permissions.some((permission) =>
    [
      "project.view_own",
      "project.view_team",
      "project.view_organization",
      "project.view_all"
    ].includes(permission)
  );
  const canCreateProject = context.permissions.includes("project.create");
  const canViewMemory = context.permissions.includes(
    "project.product_suggestion.view"
  );
  const [projects, memories] = await Promise.all([
    canViewProjects
      ? selectUserRows<{ id: string; name: string; updated_at: string }>("projects", {
          select: "id,name,updated_at",
          organization_id: `eq.${context.organization.id}`,
          deleted_at: "is.null",
          order: "updated_at.desc",
          limit: "5"
        })
      : [],
    canViewMemory
      ? selectUserRows<MemoryRow>("distributor_product_memories", {
          select:
            "id,product_name,product_number,manufacturer_name,requirement_key,usage_count,last_used_at",
          organization_id: `eq.${context.organization.id}`,
          distributor_name: "eq.Ahlsell",
          deleted_at: "is.null",
          order: "last_used_at.desc",
          limit: "5"
        })
      : []
  ]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <header className="overflow-hidden rounded-2xl border border-[#0073b6]/20 bg-white shadow-sm">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#00649e]">
              Scipx för Ahlsell · konceptdemonstration
            </p>
            <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight text-ink-950 sm:text-4xl">
              Från teknisk beskrivning till återanvändbart produktval
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-600">
              Extrahera projektkrav, låt Ahlsells specialist registrera rätt artikel och
              vanliga tillbehör, och återanvänd den kunskapen automatiskt i nästa liknande projekt.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {canCreateProject && (
                <Link
                  href="/projects/new"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0073b6] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#005f98]"
                >
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  Ny teknisk analys
                </Link>
              )}
              {canViewProjects && (
                <Link
                  href="/projects"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-800 transition hover:border-[#0073b6]/40 hover:text-[#00649e]"
                >
                  <FolderKanban className="h-4 w-4" aria-hidden="true" />
                  Öppna projekt
                </Link>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-[#0073b6]/15 bg-[#0073b6]/5 p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ahlsell-logo.svg" alt="Ahlsell" className="h-12 w-auto" />
            <p className="mt-4 max-w-xs text-xs leading-5 text-ink-500">
              Mötesanpassad prototyp. Produktval verifieras och registreras av distributören.
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <FlowCard
          icon={<FileUp className="h-5 w-5" aria-hidden="true" />}
          number="01"
          title="Extrahera krav"
          description="PDF-underlaget omvandlas till spårbara tekniska krav med källa och säkerhetsnivå."
        />
        <FlowCard
          icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />}
          number="02"
          title="Registrera Ahlsell-artikel"
          description="Specialisten väljer produkt, artikelnummer och tillbehör utan central leverantörsdatabas."
        />
        <FlowCard
          icon={<BrainCircuit className="h-5 w-5" aria-hidden="true" />}
          number="03"
          title="Återanvänd kunskapen"
          description="Nästa identiska krav visar tidigare produktval och tillbehör, rangordnade efter användning."
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Arbetsyta</p>
              <h2 className="mt-1 text-lg font-semibold text-ink-950">Senast uppdaterade projekt</h2>
            </div>
            {canViewProjects && (
              <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-semibold text-[#00649e]">
                Visa alla <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className="mt-4 divide-y divide-ink-100">
            {projects.length === 0 ? (
              <p className="rounded-lg bg-ink-50 p-5 text-sm text-ink-600">Inga projekt har skapats ännu.</p>
            ) : (
              projects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[#00649e]">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-xs text-ink-500">{formatDate(project.updated_at)}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-3">
            <PackageCheck className="h-5 w-5 text-[#0073b6]" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Produktminne</p>
              <h2 className="mt-1 text-lg font-semibold text-ink-950">Senast lärda kopplingar</h2>
            </div>
          </div>
          <div className="mt-4 divide-y divide-ink-100">
            {memories.length === 0 ? (
              <p className="rounded-lg bg-ink-50 p-5 text-sm leading-6 text-ink-600">
                Produktminnet fylls när Ahlsell registrerar det första produktvalet i ett projekt.
              </p>
            ) : (
              memories.map((memory) => (
                <div key={memory.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-950">{memory.product_name}</p>
                    <p className="mt-1 text-xs text-ink-500">Art.nr {memory.product_number} · krav {memory.requirement_key}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#0073b6]/10 px-2.5 py-1 text-xs font-semibold text-[#00649e]">
                    {memory.usage_count} val
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function FlowCard({
  icon,
  number,
  title,
  description
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0073b6]/10 text-[#0073b6]">{icon}</span>
        <span className="text-sm font-black text-ink-200">{number}</span>
      </div>
      <h2 className="mt-5 font-semibold text-ink-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}
