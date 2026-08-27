import Link from "next/link";
import {
  Activity,
  BarChart3,
  CalendarPlus2,
  CheckCircle2,
  FolderKanban
} from "lucide-react";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import { getOrganizationContext } from "@/lib/organization-context";
import { PROJECT_STAGES } from "@/lib/project-governance";
import {
  buildProjectStatistics,
  type ProjectStatisticsRow
} from "@/lib/project-statistics";
import { selectUserRows } from "@/lib/supabase-user-rest";

type StatisticsProjectRow = ProjectStatisticsRow & {
  id: string;
  name: string;
  project_number: string | null;
  updated_at: string;
};

export default async function StatisticsPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const projects = await selectUserRows<StatisticsProjectRow>("projects", {
    select:
      "id,name,project_number,status,current_stage,created_at,updated_at",
    organization_id: `eq.${context.organization.id}`,
    deleted_at: "is.null",
    order: "updated_at.desc"
  });
  const statistics = buildProjectStatistics(projects);
  const stageRows = PROJECT_STAGES.map(([stage, label]) => ({
    stage,
    label,
    count: statistics.byStage[stage] ?? 0
  })).filter((row) => row.count > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ScipxPageHeader
        eyebrow="Projekt"
        title="Statistik"
        description="Få en snabb överblick över projektens status och senaste aktivitet."
        icon={<BarChart3 aria-hidden="true" />}
      >
        <Link
          href="/projects"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-cyan-400 px-4 text-sm font-black text-[#03162d] transition hover:bg-cyan-300"
        >
          Öppna projekt
        </Link>
      </ScipxPageHeader>

      <section aria-label="Projektöversikt" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatisticsMetric
          label="Totalt antal projekt"
          value={statistics.total}
          detail={`${statistics.archived} arkiverade`}
          icon={<FolderKanban className="h-5 w-5" aria-hidden="true" />}
        />
        <StatisticsMetric
          label="Pågående"
          value={statistics.ongoing}
          detail="Projekt som fortfarande bearbetas"
          icon={<Activity className="h-5 w-5" aria-hidden="true" />}
        />
        <StatisticsMetric
          label="Klara"
          value={statistics.completed}
          detail={`${statistics.completionRate} % av alla projekt`}
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
        />
        <StatisticsMetric
          label="Nya denna månad"
          value={statistics.createdThisMonth}
          detail="Skapade projekt"
          icon={<CalendarPlus2 className="h-5 w-5" aria-hidden="true" />}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <div className="border-b border-cyan-300/15 bg-[#06213d] px-5 py-4 text-white sm:px-6">
            <h2 className="font-bold text-white">Arbetssteg</h2>
            <p className="mt-1 text-sm text-slate-300">Var de tillgängliga projekten befinner sig just nu.</p>
          </div>
          <div className="space-y-5 px-5 py-6 sm:px-6">
            {stageRows.map((row) => {
              const percent = statistics.total > 0
                ? Math.round((row.count / statistics.total) * 100)
                : 0;
              return (
                <div key={row.stage}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-ink-800">{row.label}</span>
                    <span className="tabular-nums text-ink-500">{row.count} · {percent} %</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-cyan-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {stageRows.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-500">Inga projekt att visa ännu.</p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <div className="border-b border-cyan-300/15 bg-[#06213d] px-5 py-4 text-white sm:px-6">
            <h2 className="font-bold text-white">Senast uppdaterade projekt</h2>
            <p className="mt-1 text-sm text-slate-300">De senaste ändringarna visas först.</p>
          </div>
          {projects.length === 0 ? (
            <div className="px-5 py-12 text-center sm:px-6">
              <BarChart3 className="mx-auto h-8 w-8 text-ink-300" aria-hidden="true" />
              <p className="mt-3 font-medium text-ink-800">Ingen statistik ännu</p>
              <p className="mt-1 text-sm text-ink-500">Statistiken fylls när projekt skapas.</p>
            </div>
          ) : (
            <div className="divide-y divide-ink-100">
              {projects.slice(0, 6).map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-ink-50 sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-950">{project.name}</span>
                    <span className="mt-1 block text-sm text-ink-500">
                      {project.project_number || "Utan projektnummer"} · {statusLabel(project)}
                    </span>
                  </span>
                  <time className="shrink-0 text-sm text-ink-500">{formatDate(project.updated_at)}</time>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatisticsMetric({
  label,
  value,
  detail,
  icon
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="flex items-start gap-4 rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-flow-50 text-flow-700">{icon}</span>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-950">{value}</p>
        <p className="mt-1 text-xs text-ink-500">{detail}</p>
      </div>
    </article>
  );
}

function statusLabel(project: StatisticsProjectRow) {
  if (project.status === "archived") return "Arkiverat";
  return PROJECT_STAGES.find(([stage]) => stage === project.current_stage)?.[1]
    ?? "Projektinformation";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium"
  }).format(new Date(value));
}
