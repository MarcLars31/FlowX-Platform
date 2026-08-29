import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  FolderOpen,
  Handshake,
  History,
  PackageCheck,
  Plus,
  UserRound
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import {
  loadCommercialProjectData,
  ownerNameById,
  type CommercialProjectData
} from "@/lib/commercial-project-data";
import {
  buildCommercialProjectInsights,
  type CommercialProjectInsight,
  type CommercialTechnicalPhaseKey
} from "@/lib/commercial-project-insights";
import { getOrganizationContext } from "@/lib/organization-context";

const PROJECT_VIEW_PERMISSIONS = [
  "project.view_own",
  "project.view_team",
  "project.view_organization",
  "project.view_all"
] as const;

const EMPTY_PROJECT_DATA: CommercialProjectData = {
  projects: [],
  requirements: [],
  assignments: [],
  profiles: [],
  hasRequirementInsights: false,
  hasProductSelectionInsights: false
};

export default async function DashboardPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const canViewProjects = PROJECT_VIEW_PERMISSIONS.some((permission) =>
    context.permissions.includes(permission)
  );
  const canCreateProject = context.permissions.includes("project.create");
  const data = canViewProjects
    ? await loadCommercialProjectData(context, { projectScope: "open" })
    : EMPTY_PROJECT_DATA;
  const insights = buildCommercialProjectInsights({
    projects: data.projects,
    requirements: data.hasProductSelectionInsights ? data.requirements : [],
    assignments: data.assignments
  });
  const ownerNames = ownerNameById(data.profiles);
  const productInsightsAvailable =
    data.hasRequirementInsights && data.hasProductSelectionInsights;
  const openProjects = insights.projects.filter((project) => project.isActive);
  const followUps = openProjects.filter((project) => project.needsFollowUp);
  const remainingProductPosts = openProjects.reduce(
    (total, project) => total + project.remainingProductRequirements,
    0
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <ScipxPageHeader
        eyebrow="CRM-start"
        title={`Öppna projekt i ${context.organization.name}`}
        description="Få överblick över pågående kundprojekt, prioritera nästa steg och starta ett nytt projekt direkt härifrån."
        icon={<Handshake aria-hidden="true" />}
      >
        <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
          {canViewProjects && (
            <Link
              href="/crm"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15"
            >
              <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
              Öppna hela CRM
            </Link>
          )}
          {canCreateProject && (
            <Link
              href="/projects/new"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 text-sm font-black text-[#03162d] transition hover:bg-cyan-300"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              Starta nytt projekt
            </Link>
          )}
        </div>
      </ScipxPageHeader>

      {canViewProjects && (
        <section aria-label="CRM-översikt" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric
          label="Öppna projekt"
          value={formatNumber(openProjects.length)}
          detail="pågående kundprojekt"
          icon={<FolderOpen className="h-5 w-5" aria-hidden="true" />}
          tone="cyan"
        />
        <SummaryMetric
          label="Behöver följas upp"
          value={formatNumber(followUps.length)}
          detail="prioriterade nästa steg"
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          tone={followUps.length > 0 ? "amber" : "green"}
        />
        <SummaryMetric
          label="Produktposter kvar"
          value={productInsightsAvailable ? formatNumber(remainingProductPosts) : "–"}
          detail={productInsightsAvailable ? "kvar att hantera i öppna projekt" : "produktdata är inte tillgänglig för din roll"}
          icon={<PackageCheck className="h-5 w-5" aria-hidden="true" />}
          tone="blue"
        />
        <SummaryMetric
          label="Nya denna månad"
          value={formatNumber(insights.createdThisMonth)}
          detail="öppna projekt skapade i Scipx"
          icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
          tone="green"
        />
        </section>
      )}

      <div className={canViewProjects ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" : ""}>
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-ink-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black text-ink-950">Öppna projekt</h2>
                <Badge tone="teal">{formatCount(openProjects.length, "projekt", "projekt")}</Badge>
              </div>
              <p className="mt-1 text-sm text-ink-500">Projekt som fortfarande är i arbete, prioriterade efter vad som behöver göras.</p>
            </div>
            {canViewProjects && (
              <Link
                href="/projects"
                className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-lg border border-ink-200 px-3 text-sm font-bold text-ink-800 transition hover:border-flow-300 hover:bg-flow-50 hover:text-flow-800 sm:self-auto"
              >
                Visa alla projekt
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>

          {!canViewProjects ? (
            <EmptyProjects
              title="Projektåtkomst saknas"
              detail="Din roll har inte behörighet att se organisationens projekt."
            />
          ) : openProjects.length === 0 ? (
            <EmptyProjects
              title="Inga öppna projekt"
              detail="Starta ett nytt kundprojekt så visas det automatiskt på CRM-starten."
              canCreateProject={canCreateProject}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-ink-200 bg-ink-50 text-xs font-bold uppercase tracking-[0.06em] text-ink-500">
                    <tr>
                      <th className="px-5 py-3.5 sm:px-6">Kund och projekt</th>
                      <th className="px-4 py-3.5">Fas</th>
                      <th className="px-4 py-3.5">Produktval</th>
                      <th className="px-4 py-3.5">Uppdaterat</th>
                      <th className="px-4 py-3.5">Ansvarig</th>
                      <th className="px-5 py-3.5 text-right sm:px-6">Öppna</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {openProjects.slice(0, 12).map((project) => (
                      <OpenProjectRow
                        key={project.id}
                        project={project}
                        ownerName={project.ownerUserId ? ownerNames.get(project.ownerUserId) : undefined}
                        productInsightsAvailable={productInsightsAvailable}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {openProjects.length > 12 && (
                <div className="border-t border-ink-100 bg-ink-50 px-5 py-3 text-sm text-ink-600 sm:px-6">
                  De 12 högst prioriterade projekten visas här. Alla {openProjects.length} öppna projekt finns under Projekt.
                </div>
              )}
            </>
          )}
        </section>

        {canViewProjects && (
          <aside className="space-y-6">
          <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
            <div className="border-b border-cyan-300/15 bg-[#06213d] px-5 py-4 text-white">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold">Nästa att göra</h2>
                <Badge tone={followUps.length > 0 ? "amber" : "green"}>
                  {followUps.length > 0 ? `${followUps.length} att följa upp` : "I fas"}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-300">De viktigaste öppna projektstegen just nu.</p>
            </div>
            {followUps.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" aria-hidden="true" />
                <p className="mt-3 font-bold text-ink-900">Inget akut att följa upp</p>
                <p className="mt-1 text-sm leading-6 text-ink-500">Öppna projekt har inga prioriterade varningar.</p>
              </div>
            ) : (
              <div className="divide-y divide-ink-100">
                {followUps.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    href={projectWorkHref(project)}
                    className="group block px-5 py-4 transition hover:bg-amber-50/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-ink-950">{project.name}</span>
                        <span className="mt-1 block text-sm leading-5 text-ink-600">{project.nextAction}</span>
                      </span>
                      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-ink-400 transition group-hover:translate-x-1 group-hover:text-flow-700" aria-hidden="true" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {project.isOverdue && <Badge tone="rose">Passerad leverans</Badge>}
                      {project.isStale && <Badge tone="amber">Ingen ändring på 14+ dagar</Badge>}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-cyan-900/10 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-ink-950">Snabbvägar</h2>
            <nav className="mt-3 grid gap-2" aria-label="CRM-snabbvägar">
              <QuickLink href="/crm" icon={<BriefcaseBusiness aria-hidden="true" />} label="Hela CRM" />
              <QuickLink href="/statistics" icon={<BarChart3 aria-hidden="true" />} label="Statistik" />
              <QuickLink href="/project-history" icon={<History aria-hidden="true" />} label="Projekthistorik" />
            </nav>
          </section>
          </aside>
        )}
      </div>
    </div>
  );
}

function OpenProjectRow({
  project,
  ownerName,
  productInsightsAvailable
}: {
  project: CommercialProjectInsight;
  ownerName?: string;
  productInsightsAvailable: boolean;
}) {
  return (
    <tr className={project.needsFollowUp ? "bg-amber-50/30 transition hover:bg-amber-50/70" : "transition hover:bg-ink-50"}>
      <td className="px-5 py-4 sm:px-6">
        <Link href={projectWorkHref(project)} className="font-bold text-ink-950 hover:text-flow-800 hover:underline">
          {project.name}
        </Link>
        <p className="mt-1 max-w-72 truncate text-xs text-ink-500">
          {project.customerName}{project.projectNumber ? ` · Projektnr ${project.projectNumber}` : ""}
        </p>
        {project.needsFollowUp && (
          <p className="mt-1.5 max-w-80 text-xs font-semibold text-amber-800">{project.nextAction}</p>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <Badge tone={phaseTone(project.technicalPhaseKey)}>{project.technicalPhase}</Badge>
      </td>
      <td className="min-w-44 px-4 py-4">
        {productInsightsAvailable ? (
          <>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-ink-700">{project.handledProductRequirements}/{project.totalProductRequirements}</span>
              <span className="font-black tabular-nums text-ink-950">{project.productProgress} %</span>
            </div>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink-100">
              <span className="block h-full rounded-full bg-flow-500" style={{ width: `${project.productProgress}%` }} />
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-500">Åtkomst saknas</span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-4 text-ink-600">{formatDate(project.updatedAt)}</td>
      <td className="px-4 py-4">
        <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold text-ink-700">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-flow-50 text-flow-700">
            <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          {ownerName ?? "Ej registrerat"}
        </span>
      </td>
      <td className="px-5 py-4 text-right sm:px-6">
        <Link
          href={projectWorkHref(project)}
          aria-label={`Öppna ${project.name}`}
          className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-[#06213d] px-3 text-sm font-bold text-white transition hover:bg-[#0a3156]"
        >
          Fortsätt
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "green" | "cyan" | "blue" | "amber";
}) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200"
  };
  return (
    <article className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.09em] text-ink-500">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.035em] tabular-nums text-ink-950">{value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-500">{detail}</p>
    </article>
  );
}

function EmptyProjects({
  title,
  detail,
  canCreateProject = false
}: {
  title: string;
  detail: string;
  canCreateProject?: boolean;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <FolderOpen className="h-9 w-9 text-ink-400" aria-hidden="true" />
      <h2 className="mt-3 font-bold text-ink-950">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-ink-500">{detail}</p>
      {canCreateProject && (
        <Link
          href="/projects/new"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-400 px-4 text-sm font-black text-[#03162d] transition hover:bg-cyan-300"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Starta nytt projekt
        </Link>
      )}
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-11 items-center gap-3 rounded-xl border border-ink-200 px-3 text-sm font-bold text-ink-800 transition hover:border-flow-300 hover:bg-flow-50 hover:text-flow-800"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-50 text-ink-500 transition group-hover:bg-white group-hover:text-flow-700 [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      <ArrowRight className="h-4 w-4 text-ink-400 transition group-hover:translate-x-1 group-hover:text-flow-700" aria-hidden="true" />
    </Link>
  );
}

function projectWorkHref(project: CommercialProjectInsight) {
  if (["setup", "documents", "technical_description"].includes(project.currentStage)) {
    return `/projects/${project.id}?step=documents`;
  }
  if (["requirements_review", "analysis", "product_matching"].includes(project.currentStage)) {
    return `/projects/${project.id}?step=products`;
  }
  return `/projects/${project.id}`;
}

function phaseTone(phase: CommercialTechnicalPhaseKey): "green" | "teal" | "blue" | "amber" | "slate" {
  if (phase === "completed") return "green";
  if (phase === "review") return "teal";
  if (phase === "product_selection") return "blue";
  if (phase === "analysis") return "amber";
  return "slate";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ej registrerat";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("sv-SE").format(value);
}

function formatCount(value: number, singular: string, plural: string) {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}
