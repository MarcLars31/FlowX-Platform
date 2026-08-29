import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Handshake,
  Lightbulb,
  PackageCheck,
  PackageSearch,
  UserRound
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import {
  buildBusinessDevelopmentStatistics,
  type BusinessDevelopmentStatistics
} from "@/lib/business-development-statistics";
import {
  loadCommercialProjectData,
  ownerNameById
} from "@/lib/commercial-project-data";
import {
  buildCommercialProjectInsights,
  type CommercialProjectInsight,
  type CommercialProjectInsights
} from "@/lib/commercial-project-insights";
import { getOrganizationContext } from "@/lib/organization-context";

export default async function CrmPage() {
  const context = await getOrganizationContext();
  if (!context) return null;

  const data = await loadCommercialProjectData(context);
  const insights = buildCommercialProjectInsights({
    projects: data.projects,
    requirements: data.hasProductSelectionInsights ? data.requirements : [],
    assignments: data.assignments
  });
  const businessStatistics = buildBusinessDevelopmentStatistics({
    requirements: data.requirements,
    assignments: data.assignments
  });

  return (
    <CrmDashboard
      organizationName={context.organization.name}
      insights={insights}
      businessStatistics={businessStatistics}
      ownerNames={ownerNameById(data.profiles)}
      hasRequirementInsights={data.hasRequirementInsights}
      hasProductSelectionInsights={data.hasProductSelectionInsights}
    />
  );
}

function CrmDashboard({
  organizationName,
  insights,
  businessStatistics,
  ownerNames,
  hasRequirementInsights,
  hasProductSelectionInsights
}: {
  organizationName: string;
  insights: CommercialProjectInsights;
  businessStatistics: BusinessDevelopmentStatistics;
  ownerNames: ReadonlyMap<string, string>;
  hasRequirementInsights: boolean;
  hasProductSelectionInsights: boolean;
}) {
  const productInsightsAvailable = hasRequirementInsights && hasProductSelectionInsights;
  const visibleProjects = insights.projects
    .filter((project) => !project.isArchived)
    .sort((left, right) =>
      Number(right.needsFollowUp) - Number(left.needsFollowUp)
      || Number(right.isOverdue) - Number(left.isOverdue)
      || Number(right.isStale) - Number(left.isStale)
      || right.notInAssortmentCount - left.notInAssortmentCount
      || right.remainingProductRequirements - left.remainingProductRequirements
      || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    );
  const followUps = visibleProjects.filter((project) => project.needsFollowUp);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <ScipxPageHeader
        eyebrow="Kunder och projekt"
        title="CRM"
        description="Följ kunder, projektmöjligheter och nästa steg direkt från arbetet som sker i Scipx."
        icon={<Handshake aria-hidden="true" />}
      >
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <Badge tone="green">Live projektdata</Badge>
          <Link
            href="/statistics"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-sm font-bold text-white transition hover:bg-white/15"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Se statistik
          </Link>
        </div>
      </ScipxPageHeader>

      <section
        aria-label="Datakälla"
        className="flex flex-col gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950 lg:flex-row lg:items-center lg:justify-between"
      >
        <p className="flex items-start gap-2 leading-6">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-flow-700" aria-hidden="true" />
          <span>
            <strong>Automatiskt kopplat:</strong> varje nytt projekt i {organizationName} visas här direkt.
            Siffrorna omfattar de liveprojekt du har behörighet att se; märkta demoprojekt räknas inte med.
          </span>
        </p>
        <span className="shrink-0 font-semibold tabular-nums">
          {formatCount(insights.totalProjects, "projekt", "projekt")} · {formatCount(insights.customerCount, "kund", "kunder")}
        </span>
      </section>

      <section aria-label="CRM-nyckeltal" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmMetric
          label="Aktiva projekt"
          value={formatNumber(insights.activeProjects)}
          detail="pågående projektmöjligheter"
          icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />}
          tone="cyan"
        />
        <CrmMetric
          label="Nya denna månad"
          value={formatNumber(insights.createdThisMonth)}
          detail="projekt skapade i Scipx"
          icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
          tone="blue"
        />
        <CrmMetric
          label="Behöver följas upp"
          value={formatNumber(followUps.length)}
          detail={`${insights.staleProjects} utan projektändring i 14 dagar · ${insights.overdueProjects} passerad leverans`}
          icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
          tone="amber"
        />
        <CrmMetric
          label="Färdiga projektunderlag"
          value={formatNumber(insights.completedProjects)}
          detail="tekniskt klara projektunderlag"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          tone="green"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.5fr)]">
        <section
          id="project-opportunities"
          className="scroll-mt-24 overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm"
        >
          <PanelHeader
            title="Projektmöjligheter"
            description="Kundprojekt, teknisk fas och nästa konkreta arbetssteg."
            badge={`${visibleProjects.length} liveprojekt`}
            badgeTone="teal"
          />
          {visibleProjects.length === 0 ? (
            <EmptyState
              icon={<BriefcaseBusiness className="h-8 w-8" aria-hidden="true" />}
              title="Inga liveprojekt ännu"
              detail="När ett projekt skapas visas det automatiskt i CRM-vyn."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-xs font-bold uppercase tracking-[0.06em] text-ink-500">
                  <tr>
                    <th className="px-5 py-3.5 sm:px-6">Kund och projekt</th>
                    <th className="px-4 py-3.5">Teknisk fas</th>
                    <th className="px-4 py-3.5">Produktarbete</th>
                    <th className="px-4 py-3.5">Senast ändrat</th>
                    <th className="px-4 py-3.5">Ansvarig</th>
                    <th className="px-5 py-3.5 sm:px-6">Nästa steg</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {visibleProjects.slice(0, 20).map((project) => (
                    <ProjectOpportunityRow
                      key={project.id}
                      project={project}
                      ownerName={project.ownerUserId ? ownerNames.get(project.ownerUserId) : undefined}
                      productInsightsAvailable={productInsightsAvailable}
                    />
                  ))}
                </tbody>
              </table>
              {visibleProjects.length > 20 && (
                <div className="border-t border-ink-100 bg-ink-50 px-5 py-3 text-sm text-ink-600 sm:px-6">
                  De 20 högst prioriterade projekten visas. Alla projekt finns under Projekthistorik.
                </div>
              )}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Tekniskt projektflöde"
            description="Var liveprojekten befinner sig i Scipx tekniska arbetsflöde."
            badge="Live"
            badgeTone="green"
          />
          <div className="space-y-5 p-5 sm:p-6">
            {insights.pipeline.map((stage) => (
              <div key={stage.key}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink-800">{stage.label}</span>
                  <span className="font-black tabular-nums text-ink-950">{stage.count}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={pipelineColor(stage.key)}
                    style={{ width: `${stage.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {insights.activeProjects === 0 && (
              <p className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm text-ink-600">
                Inga aktiva projekt att fördela i flödet.
              </p>
            )}
            <p className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900">
              Flödet visar teknisk projektstatus, inte affärsvärde eller sannolikhet. Sådana uppgifter visas först när de registreras uttryckligen.
            </p>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <FollowUpPanel followUps={followUps} />
        <CustomerPanel insights={insights} productInsightsAvailable={productInsightsAvailable} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ProductSignals
          insights={insights}
          businessStatistics={businessStatistics}
          hasRequirementInsights={hasRequirementInsights}
          productInsightsAvailable={productInsightsAvailable}
        />
        <RecentActivity projects={visibleProjects} />
      </div>
    </div>
  );
}

function FollowUpPanel({ followUps }: { followUps: CommercialProjectInsight[] }) {
  return (
    <section
      id="follow-ups"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm"
    >
      <PanelHeader
        title="Behöver följas upp"
        description="Projekt med passerad leveransdag, lång inaktivitet eller kvarvarande produktarbete."
        badge={`${followUps.length} projekt`}
        badgeTone={followUps.length > 0 ? "amber" : "green"}
      />
      {followUps.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" aria-hidden="true" />}
          title="Inget akut att följa upp"
          detail="Alla aktiva projekt har nyligen ändrats och har inga passerade leveransdagar."
        />
      ) : (
        <div className="divide-y divide-ink-100">
          {followUps.slice(0, 8).map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group flex items-start justify-between gap-4 px-5 py-4 transition hover:bg-ink-50 sm:px-6"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-bold text-ink-950">{project.customerName} · {project.name}</h3>
                  {project.isOverdue && <Badge tone="rose">Passerad leverans</Badge>}
                  {project.isStale && <Badge tone="amber">14+ dagar</Badge>}
                </div>
                <p className="mt-1 text-sm text-ink-600">{project.nextAction}</p>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-1 group-hover:text-flow-700" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function CustomerPanel({
  insights,
  productInsightsAvailable
}: {
  insights: CommercialProjectInsights;
  productInsightsAvailable: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
      <PanelHeader
        title="Kunder"
        description="Projektbelastning och produktstatus per kund."
        badge={formatCount(insights.customerCount, "kund", "kunder")}
        badgeTone="teal"
      />
      {insights.customerSummaries.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" aria-hidden="true" />}
          title="Inga kunder att visa"
          detail="Kunden hämtas automatiskt från projektet."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs font-bold uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Kund</th>
                <th className="px-4 py-3.5 text-right">Projekt</th>
                <th className="px-4 py-3.5 text-right">Aktiva</th>
                <th className="px-4 py-3.5 text-right">Klara</th>
                <th className="px-5 py-3.5 text-right sm:px-6">Produktstatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {insights.customerSummaries.slice(0, 10).map((customer) => (
                <tr key={customer.customerName}>
                  <td className="px-5 py-3.5 font-bold text-ink-950 sm:px-6">{customer.customerName}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{customer.totalProjects}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{customer.activeProjects}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{customer.completedProjects}</td>
                  <td className="px-5 py-3.5 text-right tabular-nums sm:px-6">
                    {productInsightsAvailable
                      ? `${customer.productProgress} % · ${customer.notInAssortmentCount} luckor`
                      : "Åtkomst saknas"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProductSignals({
  insights,
  businessStatistics,
  hasRequirementInsights,
  productInsightsAvailable
}: {
  insights: CommercialProjectInsights;
  businessStatistics: BusinessDevelopmentStatistics;
  hasRequirementInsights: boolean;
  productInsightsAvailable: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
      <PanelHeader
        title="Produktsignaler"
        description="Faktisk efterfrågan från produktvalen i projekten."
        badge={productInsightsAvailable ? "Live" : "Begränsad åtkomst"}
        badgeTone={productInsightsAvailable ? "green" : "amber"}
      />
      {!hasRequirementInsights ? (
        <EmptyState
          icon={<PackageSearch className="h-8 w-8" aria-hidden="true" />}
          title="Produktkrav är inte tillgängliga"
          detail="Din roll kan se projekten men saknar behörighet till produktkraven."
        />
      ) : businessStatistics.gapOpportunities.length === 0 && insights.topApprovedProducts.length === 0 ? (
        <EmptyState
          icon={<PackageCheck className="h-8 w-8" aria-hidden="true" />}
          title="Inga produktsignaler ännu"
          detail="Återkommande sortimentsluckor och godkända produkter visas när projekten bearbetas."
        />
      ) : (
        <div className="divide-y divide-ink-100">
          {businessStatistics.gapOpportunities.slice(0, 3).map((gap) => (
            <SignalRow
              key={gap.key}
              icon={<PackageSearch className="h-5 w-5" aria-hidden="true" />}
              title={gap.name}
              detail={`${gap.projectCount} projekt · ${gap.occurrences} ${gap.occurrences === 1 ? "post" : "poster"} märkta Inte i sortiment`}
              action={gap.recommendedAction}
            />
          ))}
          {insights.topApprovedProducts.slice(0, 3).map((product) => (
            <SignalRow
              key={product.key}
              icon={<PackageCheck className="h-5 w-5" aria-hidden="true" />}
              title={product.name}
              detail={`${formatCount(product.approvals, "godkänt val", "godkända val")} i ${formatCount(product.projectCount, "projekt", "projekt")}${product.nrfNumber ? ` · NRF ${product.nrfNumber}` : ""}`}
              action="Återanvänd den bekräftade produkten när samma krav återkommer"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RecentActivity({ projects }: { projects: CommercialProjectInsight[] }) {
  const recent = [...projects]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 8);
  return (
    <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
      <PanelHeader
        title="Senaste projektaktivitet"
        description="Senaste projektändring – inte registrerad kundkontakt."
        badge="Live"
        badgeTone="green"
      />
      {recent.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-8 w-8" aria-hidden="true" />}
          title="Ingen aktivitet ännu"
          detail="Projektändringar visas här när arbetet börjar."
        />
      ) : (
        <div className="divide-y divide-ink-100">
          {recent.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-ink-50 sm:px-6"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold text-ink-950">{project.name}</span>
                <span className="mt-1 block text-sm text-ink-500">
                  {project.customerName} · {project.technicalPhase} · {formatDate(project.updatedAt)}
                </span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-1 group-hover:text-flow-700" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ProjectOpportunityRow({
  project,
  ownerName,
  productInsightsAvailable
}: {
  project: CommercialProjectInsight;
  ownerName?: string;
  productInsightsAvailable: boolean;
}) {
  return (
    <tr className={project.needsFollowUp ? "bg-amber-50/30 transition hover:bg-amber-50/60" : "transition hover:bg-ink-50"}>
      <td className="px-5 py-4 sm:px-6">
        <Link href={`/projects/${project.id}`} className="font-bold text-ink-950 hover:text-flow-800 hover:underline">
          {project.customerName}
        </Link>
        <p className="mt-1 max-w-72 truncate text-xs text-ink-500">
          {project.name}{project.projectNumber ? ` · ${project.projectNumber}` : ""}
        </p>
      </td>
      <td className="whitespace-nowrap px-4 py-4">
        <Badge tone={phaseTone(project.technicalPhaseKey)}>{project.technicalPhase}</Badge>
      </td>
      <td className="min-w-48 px-4 py-4">
        {productInsightsAvailable ? (
          <>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-ink-700">{project.handledProductRequirements}/{project.totalProductRequirements} hanterade</span>
              <span className="font-black tabular-nums text-ink-950">{project.productProgress} %</span>
            </div>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-ink-100">
              <span className="block h-full rounded-full bg-flow-500" style={{ width: `${project.productProgress}%` }} />
            </span>
            {project.notInAssortmentCount > 0 && (
              <span className="mt-1.5 block text-xs font-semibold text-amber-700">{project.notInAssortmentCount} inte i sortiment</span>
            )}
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
      <td className="min-w-60 px-5 py-4 text-ink-700 sm:px-6">
        <span>{project.nextAction}</span>
        {project.isOverdue && <span className="mt-1 block text-xs font-bold text-rose-700">Leveransdatum har passerat</span>}
      </td>
    </tr>
  );
}

function CrmMetric({ label, value, detail, icon, tone }: {
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

function PanelHeader({ title, description, badge, badgeTone = "slate" }: {
  title: string;
  description: string;
  badge?: string;
  badgeTone?: "amber" | "green" | "teal" | "slate";
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-cyan-300/15 bg-[#06213d] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <h2 className="font-bold text-white">{title}</h2>
        <p className="mt-1 text-sm text-slate-300">{description}</p>
      </div>
      {badge && <Badge tone={badgeTone}>{badge}</Badge>}
    </div>
  );
}

function SignalRow({ icon, title, detail, action }: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  action: string;
}) {
  return (
    <article className="flex gap-4 px-5 py-5 sm:px-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flow-50 text-flow-700 ring-1 ring-flow-200">{icon}</span>
      <div className="min-w-0">
        <h3 className="font-bold text-ink-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-ink-600">{detail}</p>
        <p className="mt-2 flex items-start gap-1.5 text-xs font-bold text-flow-800">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{action}
        </p>
      </div>
    </article>
  );
}

function EmptyState({ icon, title, detail }: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="px-5 py-10 text-center sm:px-6">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-ink-50 text-ink-400">{icon}</span>
      <p className="mt-3 font-bold text-ink-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-500">{detail}</p>
    </div>
  );
}

function phaseTone(phase: string): "green" | "teal" | "blue" | "amber" | "slate" {
  if (phase === "completed") return "green";
  if (phase === "review") return "teal";
  if (phase === "product_selection") return "blue";
  if (phase === "analysis") return "amber";
  return "slate";
}

function pipelineColor(key: string) {
  const colors: Record<string, string> = {
    new_request: "h-full rounded-full bg-cyan-400",
    analysis: "h-full rounded-full bg-sky-500",
    product_selection: "h-full rounded-full bg-blue-600",
    review: "h-full rounded-full bg-indigo-600",
    completed: "h-full rounded-full bg-emerald-500"
  };
  return colors[key] ?? "h-full rounded-full bg-slate-500";
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
