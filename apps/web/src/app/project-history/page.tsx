import Link from "next/link";
import { Clock3, FolderKanban, History } from "lucide-react";
import { getOrganizationContext } from "@/lib/organization-context";
import { PROJECT_STAGES } from "@/lib/project-governance";
import { selectUserRows } from "@/lib/supabase-user-rest";

type ProjectHistoryRow = {
  id: string;
  name: string;
  project_number: string | null;
  status: string;
  current_stage: string | null;
  created_at: string;
  updated_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  entity_id: string | null;
  old_values: unknown;
  new_values: unknown;
  created_at: string;
};

export default async function ProjectHistoryPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const canViewAudit = context.permissions.includes("audit_log.view");
  const [projects, events] = await Promise.all([
    selectUserRows<ProjectHistoryRow>("projects", {
      select:
        "id,name,project_number,status,current_stage,created_at,updated_at",
      organization_id: `eq.${context.organization.id}`,
      deleted_at: "is.null",
      order: "updated_at.desc",
      limit: "100"
    }),
    canViewAudit
      ? selectUserRows<AuditRow>("audit_logs", {
          select:
            "id,action,entity_id,old_values,new_values,created_at",
          organization_id: `eq.${context.organization.id}`,
          entity_type: "eq.project",
          order: "created_at.desc",
          limit: "100"
        })
      : Promise.resolve([])
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-flow-700">
            Projekt
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-ink-950">
            Projekthistorik
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">
            Följ när projekt skapades, uppdaterades och bytte arbetssteg.
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex min-h-10 items-center justify-center rounded-lg bg-flow-600 px-4 text-sm font-semibold text-white transition hover:bg-flow-700"
        >
          Öppna projekt
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <HistoryMetric
          label="Tillgängliga projekt"
          value={projects.length}
          detail="Projekt du har behörighet att öppna"
          icon={<FolderKanban className="h-5 w-5" aria-hidden="true" />}
        />
        <HistoryMetric
          label={canViewAudit ? "Registrerade händelser" : "Senast uppdaterat"}
          value={canViewAudit ? events.length : projects.length}
          detail={canViewAudit ? "De 100 senaste projekthändelserna" : "Tidslinje baserad på projektens ändringar"}
          icon={<History className="h-5 w-5" aria-hidden="true" />}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
        <div className="border-b border-ink-100 px-5 py-4 sm:px-6">
          <h2 className="font-semibold text-ink-950">Tidslinje</h2>
          <p className="mt-1 text-sm text-ink-600">Nyaste händelsen visas först.</p>
        </div>
        <div className="divide-y divide-ink-100">
          {canViewAudit
            ? events.map((event) => {
                const project = event.entity_id
                  ? projectById.get(event.entity_id)
                  : undefined;
                const projectName =
                  project?.name ?? valueName(event.new_values) ?? valueName(event.old_values) ?? "Projekt";
                return (
                  <HistoryEvent
                    key={event.id}
                    title={projectName}
                    description={actionLabel(event.action)}
                    date={event.created_at}
                    href={project ? `/projects/${project.id}` : undefined}
                  />
                );
              })
            : projects.map((project) => (
                <HistoryEvent
                  key={project.id}
                  title={project.name}
                  description={`Senast uppdaterat · ${stageLabel(project.current_stage)} · ${statusLabel(project.status)}`}
                  date={project.updated_at}
                  href={`/projects/${project.id}`}
                />
              ))}
          {(canViewAudit ? events.length === 0 : projects.length === 0) && (
            <div className="px-5 py-12 text-center sm:px-6">
              <Clock3 className="mx-auto h-8 w-8 text-ink-300" aria-hidden="true" />
              <p className="mt-3 font-medium text-ink-800">Ingen projekthistorik ännu</p>
              <p className="mt-1 text-sm text-ink-500">Historiken fylls när projekt skapas och uppdateras.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function HistoryMetric({
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
        <p className="mt-1 text-2xl font-semibold text-ink-950">{value}</p>
        <p className="mt-1 text-xs text-ink-500">{detail}</p>
      </div>
    </article>
  );
}

function HistoryEvent({
  title,
  description,
  date,
  href
}: {
  title: string;
  description: string;
  date: string;
  href?: string;
}) {
  const content = (
    <div className="flex flex-col gap-2 px-5 py-4 transition hover:bg-ink-50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="font-medium text-ink-950">{title}</p>
        <p className="mt-1 text-sm text-ink-600">{description}</p>
      </div>
      <time className="shrink-0 text-sm text-ink-500">{formatDate(date)}</time>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    "project.created": "Projektet skapades",
    "project.updated": "Projektet uppdaterades",
    "project.deleted": "Projektet flyttades till papperskorgen",
    "project.restored": "Projektet återställdes",
    "project.permanently_deleted": "Projektet raderades permanent",
    "project.access_changed": "Projektåtkomsten ändrades",
    "project.member_added": "En projektmedlem lades till",
    "project.member_removed": "En projektmedlem togs bort"
  };
  return labels[action] ?? action;
}

function stageLabel(stage: string | null) {
  return PROJECT_STAGES.find(([value]) => value === stage)?.[1] ?? "Projektinformation";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Utkast",
    active: "Aktivt",
    on_hold: "Pausat",
    completed: "Klart",
    archived: "Arkiverat"
  };
  return labels[status] ?? status;
}

function valueName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = (value as Record<string, unknown>).name;
  return typeof name === "string" && name.trim() ? name : null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
