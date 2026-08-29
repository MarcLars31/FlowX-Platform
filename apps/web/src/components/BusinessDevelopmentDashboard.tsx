import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  FolderKanban,
  History,
  PackageCheck,
  PackageSearch,
  UsersRound
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import type {
  BusinessDevelopmentStatistics,
  ProductGapOpportunity
} from "@/lib/business-development-statistics";
import type { CommercialProjectInsights } from "@/lib/commercial-project-insights";

export function BusinessDevelopmentDashboard({
  organizationName,
  businessStatistics,
  commercialInsights,
  hasRequirementInsights,
  hasProductSelectionInsights
}: {
  organizationName: string;
  businessStatistics: BusinessDevelopmentStatistics;
  commercialInsights: CommercialProjectInsights;
  hasRequirementInsights: boolean;
  hasProductSelectionInsights: boolean;
}) {
  const productInsightsAvailable = hasRequirementInsights && hasProductSelectionInsights;
  const followUpProjects = commercialInsights.projects
    .filter((project) => project.needsFollowUp)
    .sort((left, right) =>
      Number(right.isOverdue) - Number(left.isOverdue)
      || Number(right.isStale) - Number(left.isStale)
      || Date.parse(left.updatedAt) - Date.parse(right.updatedAt)
    );
  const recentProjects = [...commercialInsights.projects]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 6);
  const maximumMonthlyActivity = Math.max(
    1,
    ...commercialInsights.monthlyActivity.flatMap((month) => [month.created, month.completed])
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <ScipxPageHeader
        eyebrow="Statistik"
        title="Projekt- och försäljningsöversikt"
        description="Följ projektflöde, kundaktivitet, produktval och återkommande sortimentsbehov."
        icon={<BarChart3 aria-hidden="true" />}
      >
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <Badge tone="teal">Live projektdata</Badge>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
            {organizationName}
          </span>
        </div>
      </ScipxPageHeader>

      <section
        aria-label="Om statistiken"
        className="flex flex-col gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950 lg:flex-row lg:items-center lg:justify-between"
      >
        <p className="leading-6">
          Statistiken bygger på projekt som du har åtkomst till och uppdateras när projekt,
          produktposter och produktval ändras i Scipx.
        </p>
        <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 font-semibold tabular-nums">
          <span>{formatCount(commercialInsights.totalProjects, "projekt", "projekt")}</span>
          <span>{formatCount(commercialInsights.customerCount, "kund", "kunder")}</span>
          <span>{hasRequirementInsights ? `${businessStatistics.totalProductRequirements} produktposter` : "Produktdata: begränsad åtkomst"}</span>
        </div>
      </section>

      <section aria-label="Nyckeltal" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LiveMetric
          label="Aktiva projekt"
          value={formatNumber(commercialInsights.activeProjects)}
          detail={`${commercialInsights.staleProjects} behöver uppföljning efter utebliven aktivitet`}
          icon={<FolderKanban className="h-5 w-5" aria-hidden="true" />}
          tone="cyan"
        />
        <LiveMetric
          label="Nya denna månad"
          value={formatNumber(commercialInsights.createdThisMonth)}
          detail="Projekt som upprättats under innevarande månad"
          icon={<CalendarPlus className="h-5 w-5" aria-hidden="true" />}
          tone="blue"
        />
        <LiveMetric
          label="Färdiga projektunderlag"
          value={formatNumber(commercialInsights.completedProjects)}
          detail="Tekniskt klara projekt enligt aktuell projektstatus"
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          tone="green"
        />
        <LiveMetric
          label="Produkttäckning"
          value={productInsightsAvailable ? `${businessStatistics.productCoverageRate} %` : "—"}
          detail={productInsightsAvailable
            ? `${businessStatistics.approvedProductRequirements} av ${businessStatistics.totalProductRequirements} produktposter har godkänt val`
            : "Din roll saknar åtkomst till produktvalen"}
          icon={<PackageCheck className="h-5 w-5" aria-hidden="true" />}
          tone="amber"
        />
      </section>

      <section aria-label="Operativa signaler" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CompactMetric
          label="Genomsnittlig produkthantering"
          value={productInsightsAvailable ? `${commercialInsights.averageProductProgress} %` : "—"}
          detail={productInsightsAvailable ? "Godkänt val eller hanterad sortimentslucka" : "Produktval är inte tillgängliga för din roll"}
        />
        <CompactMetric
          label="Försenad leverans"
          value={formatNumber(commercialInsights.overdueProjects)}
          detail="Aktiva projekt där förväntat leveransdatum har passerat"
          warning={commercialInsights.overdueProjects > 0}
        />
        <CompactMetric
          label="Inte i sortiment"
          value={hasRequirementInsights ? formatNumber(businessStatistics.notInAssortmentCount) : "—"}
          detail={hasRequirementInsights ? "Hanterade produktposter som kan ge inköp en signal" : "Produktkrav är inte tillgängliga för din roll"}
          warning={businessStatistics.notInAssortmentCount > 0}
        />
        <CompactMetric
          label="Hanterade produktposter"
          value={productInsightsAvailable ? `${businessStatistics.handledProductRate} %` : "—"}
          detail={productInsightsAvailable ? "Godkända val och markerade sortimentsluckor" : "Produktval är inte tillgängliga för din roll"}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Tekniskt projektflöde"
            description="Var projekten befinner sig i Scipx arbetsflöde."
            badge={formatCount(commercialInsights.activeProjects, "aktivt projekt", "aktiva projekt")}
          />
          {commercialInsights.totalProjects === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-8 w-8" aria-hidden="true" />}
              title="Inga projekt att sammanställa ännu"
              description="Flödet fylls på automatiskt när projekt upprättas."
            />
          ) : (
            <div className="space-y-5 p-5 sm:p-6">
              {commercialInsights.pipeline.map((stage) => (
                <div key={stage.key}>
                  <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                    <span className="font-medium text-ink-800">{stage.label}</span>
                    <span className="font-bold tabular-nums text-ink-950">{stage.count}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-flow-600"
                      style={{ width: `${Math.max(0, Math.min(100, stage.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Projektaktivitet"
            description="Upprättade projekt samt färdiga projekt grupperade efter senaste projektändring."
          />
          {commercialInsights.totalProjects === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-8 w-8" aria-hidden="true" />}
              title="Ingen aktivitet att visa ännu"
              description="Diagrammet fylls på när projekt skapas och färdigställs."
            />
          ) : (
            <div className="p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-center gap-5 text-xs font-semibold text-ink-600">
                <Legend color="bg-cyan-500" label="Upprättade" />
                <Legend color="bg-emerald-500" label="Färdiga · senast ändrade" />
              </div>
              <div
                className="grid h-60 gap-3 border-b border-ink-200 px-1"
                style={{ gridTemplateColumns: `repeat(${commercialInsights.monthlyActivity.length}, minmax(0, 1fr))` }}
              >
                {commercialInsights.monthlyActivity.map((month) => (
                  <div key={month.monthKey} className="flex min-w-0 flex-col justify-end gap-2">
                    <div
                      className="flex h-44 items-end justify-center gap-1 sm:gap-2"
                      aria-label={`${month.label}: ${month.created} upprättade och ${month.completed} tekniskt färdiga`}
                    >
                      <ChartBar value={month.created} max={maximumMonthlyActivity} color="bg-cyan-500" />
                      <ChartBar value={month.completed} max={maximumMonthlyActivity} color="bg-emerald-500" />
                    </div>
                    <span className="truncate pb-3 text-center text-xs font-semibold text-ink-500">{month.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-ink-500">
                Den gröna serien är inte ett verkligt slutdatum. Färdiga projekt grupperas efter sin senaste
                projektändring tills ett separat slutförandedatum registreras.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Projekt att följa upp"
            description="Projekt med försenat leveransdatum, låg aktivitet eller kvarvarande produktarbete."
            badge={`${followUpProjects.length} att följa upp`}
            badgeTone={followUpProjects.length > 0 ? "amber" : "green"}
          />
          {followUpProjects.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-8 w-8" aria-hidden="true" />}
              title="Inga projekt kräver uppföljning just nu"
              description="Nya signaler visas här när projektdata ändras."
            />
          ) : (
            <div className="divide-y divide-ink-100">
              {followUpProjects.slice(0, 7).map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group grid gap-3 px-5 py-4 transition hover:bg-ink-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-ink-950">{project.name}</span>
                      {project.isOverdue && <Badge tone="amber">Försenad</Badge>}
                      {!project.isOverdue && project.isStale && <Badge tone="slate">Låg aktivitet</Badge>}
                    </span>
                    <span className="mt-1 block text-sm text-ink-500">
                      {project.customerName} · {project.technicalPhase} · uppdaterat {formatDate(project.updatedAt)}
                    </span>
                    <span className="mt-2 block text-sm font-medium text-flow-800">{project.nextAction}</span>
                  </span>
                  <span className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="text-right text-xs text-ink-500">
                      <strong className="block text-sm tabular-nums text-ink-950">
                        {productInsightsAvailable ? `${project.productProgress} %` : "—"}
                      </strong>
                      {productInsightsAvailable ? "produkthantering" : "begränsad åtkomst"}
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-1 group-hover:text-flow-700" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Kundöversikt"
            description="Projektaktivitet och produkthantering per kund."
            badge={formatCount(commercialInsights.customerCount, "kund", "kunder")}
          />
          {commercialInsights.customerSummaries.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="h-8 w-8" aria-hidden="true" />}
              title="Inga kunder att sammanställa ännu"
              description="Kundnamn hämtas från de projekt du har åtkomst till."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-xs font-bold uppercase tracking-[0.06em] text-ink-500">
                  <tr>
                    <th className="px-5 py-3.5 sm:px-6">Kund</th>
                    <th className="px-4 py-3.5 text-right">Projekt</th>
                    <th className="px-4 py-3.5 text-right">Aktiva</th>
                    <th className="px-5 py-3.5 text-right sm:px-6">Produkter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {commercialInsights.customerSummaries.slice(0, 8).map((customer) => (
                    <tr key={customer.customerName}>
                      <td className="max-w-[240px] px-5 py-4 sm:px-6">
                        <span className="block truncate font-semibold text-ink-950">{customer.customerName}</span>
                        {hasRequirementInsights && customer.notInAssortmentCount > 0 && (
                          <span className="mt-1 block text-xs text-amber-700">
                            {customer.notInAssortmentCount} {customer.notInAssortmentCount === 1 ? "sortimentslucka" : "sortimentsluckor"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-ink-700">{customer.totalProjects}</td>
                      <td className="px-4 py-4 text-right tabular-nums text-ink-700">{customer.activeProjects}</td>
                      <td className="px-5 py-4 text-right sm:px-6">
                        <span className="font-bold tabular-nums text-ink-950">
                          {productInsightsAvailable ? `${customer.productProgress} %` : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
        <PanelHeader
          title="Efterfrågat men inte i sortiment"
          description="Återkommande produktbehov som användare har markerat som Inte i sortiment."
          badge={hasRequirementInsights ? `${businessStatistics.notInAssortmentCount} poster` : "Begränsad åtkomst"}
          badgeTone={!hasRequirementInsights ? "amber" : businessStatistics.notInAssortmentCount > 0 ? "amber" : "green"}
        />
        {!hasRequirementInsights ? (
          <EmptyState
            icon={<PackageSearch className="h-8 w-8" aria-hidden="true" />}
            title="Produktkrav är inte tillgängliga"
            description="Din roll kan se projektstatistik men saknar behörighet till produktkraven."
          />
        ) : businessStatistics.gapOpportunities.length === 0 ? (
          <EmptyState
            icon={<PackageSearch className="h-8 w-8" aria-hidden="true" />}
            title="Inga sortimentsluckor registrerade"
            description="Produkter som markeras som Inte i sortiment visas här automatiskt."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs font-bold uppercase tracking-[0.06em] text-ink-500">
                <tr>
                  <th className="px-5 py-3.5 sm:px-6">Produkt eller krav</th>
                  <th className="px-4 py-3.5">Kategori</th>
                  <th className="px-4 py-3.5 text-right">Projekt</th>
                  <th className="px-4 py-3.5 text-right">Behov</th>
                  <th className="px-5 py-3.5 sm:px-6">Rekommenderad åtgärd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {businessStatistics.gapOpportunities.slice(0, 8).map((gap) => (
                  <GapTableRow key={gap.key} gap={gap} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Mest godkända produkter"
            description="Produkter som användare uttryckligen har valt och godkänt i projekt."
          />
          {!productInsightsAvailable ? (
            <EmptyState
              icon={<PackageCheck className="h-8 w-8" aria-hidden="true" />}
              title="Produktval är inte tillgängliga"
              description="Din roll saknar behörighet till projektens valda produkter."
            />
          ) : commercialInsights.topApprovedProducts.length === 0 ? (
            <EmptyState
              icon={<PackageCheck className="h-8 w-8" aria-hidden="true" />}
              title="Inga godkända produktval ännu"
              description="Listan fylls på när användare godkänner produktval."
            />
          ) : (
            <div className="divide-y divide-ink-100">
              {commercialInsights.topApprovedProducts.slice(0, 7).map((product, index) => (
                <article key={product.key} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-sm font-black text-flow-800 ring-1 ring-cyan-200">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink-950">{product.name}</span>
                    <span className="mt-1 block text-xs text-ink-500">
                      {product.nrfNumber ? `NRF ${product.nrfNumber}` : "NRF-nummer saknas"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-ink-500">
                    <strong className="block text-base tabular-nums text-ink-950">{product.approvals}</strong>
                    {product.projectCount} projekt
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Senaste projektaktivitet"
            description="Senast uppdaterade projekt som du har åtkomst till."
            badge={`${commercialInsights.totalProjects} projekt`}
          />
          {recentProjects.length === 0 ? (
            <EmptyState
              icon={<History className="h-8 w-8" aria-hidden="true" />}
              title="Inga projekt att visa ännu"
              description="Nya projekt visas här när de har upprättats."
            />
          ) : (
            <div className="divide-y divide-ink-100">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-ink-50 sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink-950">{project.name}</span>
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
      </div>
    </div>
  );
}

function LiveMetric({
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
    <article className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.09em] text-ink-500">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.035em] tabular-nums text-ink-950">{value}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tones[tone]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-sm leading-5 text-ink-500">{detail}</p>
    </article>
  );
}

function CompactMetric({
  label,
  value,
  detail,
  warning = false
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <article className={`rounded-xl border p-4 ${warning ? "border-amber-200 bg-amber-50" : "border-ink-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-500">{label}</p>
        {warning && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />}
      </div>
      <p className={`mt-2 text-2xl font-black tabular-nums ${warning ? "text-amber-900" : "text-ink-950"}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-ink-500">{detail}</p>
    </article>
  );
}

function PanelHeader({
  title,
  description,
  badge,
  badgeTone = "teal"
}: {
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

function EmptyState({
  icon,
  title,
  description
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-12 text-center sm:px-6">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-ink-50 text-ink-300">
        {icon}
      </span>
      <p className="mt-3 font-semibold text-ink-800">{title}</p>
      <p className="mt-1 text-sm text-ink-500">{description}</p>
    </div>
  );
}

function GapTableRow({ gap }: { gap: ProductGapOpportunity }) {
  const demand = gap.quantity !== null && gap.unit
    ? `${formatNumber(gap.quantity)} ${gap.unit}`
    : `${gap.occurrences} ${gap.occurrences === 1 ? "post" : "poster"}`;

  return (
    <tr className="transition hover:bg-ink-50">
      <td className="max-w-md px-5 py-4 font-semibold text-ink-950 sm:px-6">{gap.name}</td>
      <td className="whitespace-nowrap px-4 py-4 text-ink-600">{gap.category}</td>
      <td className="px-4 py-4 text-right font-semibold tabular-nums text-ink-900">{gap.projectCount}</td>
      <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-ink-700">{demand}</td>
      <td className="px-5 py-4 sm:px-6">
        <div className="flex items-start gap-2">
          <Badge tone={gap.priority === "high" ? "amber" : gap.priority === "medium" ? "teal" : "slate"}>
            {gap.priority === "high" ? "Hög prioritet" : gap.priority === "medium" ? "Medel" : "Bevaka"}
          </Badge>
          <span className="text-ink-700">{gap.recommendedAction}</span>
        </div>
      </td>
    </tr>
  );
}

function ChartBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex h-full w-4 flex-col justify-end sm:w-8">
      {value > 0 && (
        <span className="mb-1 text-center text-[10px] font-bold tabular-nums text-ink-500">{value}</span>
      )}
      <span
        className={`block rounded-t-md ${color}`}
        style={{ height: value > 0 ? `${Math.max(8, Math.round((value / max) * 100))}%` : 0 }}
      />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(value);
}

function formatCount(value: number, singular: string, plural: string) {
  return `${formatNumber(value)} ${value === 1 ? singular : plural}`;
}
