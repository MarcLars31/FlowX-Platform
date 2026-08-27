import Link from "next/link";
import {
  ArrowRight,
  Award,
  BarChart3,
  BriefcaseBusiness,
  Clock3,
  Lightbulb,
  PackageSearch,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";
import type {
  BusinessDevelopmentStatistics,
  ProductGapOpportunity
} from "@/lib/business-development-statistics";
import { PROJECT_STAGES } from "@/lib/project-governance";
import type { ProjectStatistics } from "@/lib/project-statistics";

type DashboardProject = {
  id: string;
  name: string;
  project_number: string | null;
  status: string;
  current_stage: string | null;
  updated_at: string;
};

type GapRow = {
  name: string;
  category: string;
  offers: number;
  demand: string;
  potential: string;
  action: string;
  priority: "high" | "medium" | "low";
};

const DEMO_OUTCOMES = [
  { month: "Mar", won: 2, lost: 2, open: 0 },
  { month: "Apr", won: 1, lost: 2, open: 0 },
  { month: "Maj", won: 3, lost: 1, open: 1 },
  { month: "Jun", won: 2, lost: 2, open: 2 },
  { month: "Jul", won: 3, lost: 2, open: 4 },
  { month: "Aug", won: 3, lost: 2, open: 6 }
] as const;

const DEMO_PIPELINE = [
  { label: "Nya förfrågningar", value: 13, color: "bg-cyan-400" },
  { label: "Under beräkning", value: 9, color: "bg-sky-500" },
  { label: "Skickade offerter", value: 6, color: "bg-blue-600" },
  { label: "I förhandling", value: 4, color: "bg-indigo-600" },
  { label: "Vunna", value: 3, color: "bg-emerald-500" }
] as const;

const DEMO_TIME_STEPS = [
  { label: "Läsa och tolka PDF", minutes: 9, color: "bg-cyan-400" },
  { label: "Kontrollera krav", minutes: 12, color: "bg-sky-500" },
  { label: "Välja produkter", minutes: 15, color: "bg-blue-600" },
  { label: "Granska och exportera", minutes: 5, color: "bg-indigo-600" }
] as const;

const DEMO_GAPS: GapRow[] = [
  {
    name: "Flexibel sprinklerslang DN25",
    category: "Sprinkler",
    offers: 8,
    demand: "1 240 st",
    potential: "310 000 SEK",
    action: "Utvärdera lagerartikel",
    priority: "high"
  },
  {
    name: "Räfflat rör DN32",
    category: "Rör",
    offers: 6,
    demand: "2 880 m",
    potential: "260 000 SEK",
    action: "Samla volym för inköp",
    priority: "high"
  },
  {
    name: "QR K80 upright sprinklerhuvud",
    category: "Sprinklerhuvuden",
    offers: 5,
    demand: "720 st",
    potential: "180 000 SEK",
    action: "Säkra alternativt NRF-nummer",
    priority: "high"
  },
  {
    name: "Backventil DN65 PN16",
    category: "Ventiler",
    offers: 4,
    demand: "23 st",
    potential: "95 000 SEK",
    action: "Begär rampris",
    priority: "medium"
  },
  {
    name: "I/O-enhet för flödesvakt",
    category: "Styrning",
    offers: 4,
    demand: "31 st",
    potential: "62 000 SEK",
    action: "Bedöm partnerlösning",
    priority: "medium"
  }
];

export function BusinessDevelopmentDashboard({
  organizationName,
  projects,
  projectStatistics,
  businessStatistics
}: {
  organizationName: string;
  projects: DashboardProject[];
  projectStatistics: ProjectStatistics;
  businessStatistics: BusinessDevelopmentStatistics;
}) {
  const hasLiveGaps = businessStatistics.gapOpportunities.length > 0;
  const gapRows = hasLiveGaps
    ? businessStatistics.gapOpportunities.slice(0, 6).map(liveGapRow)
    : DEMO_GAPS;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <ScipxPageHeader
        eyebrow="Affärsutveckling"
        title="Affärsöversikt"
        description="Se vad ni vinner, var tiden går och vilka sortimentsluckor som återkommer."
        icon={<BarChart3 aria-hidden="true" />}
      >
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <Badge tone="amber" className="whitespace-normal text-left leading-5">
            DEMO · Utfall, värde och arbetstid är exempeldata
          </Badge>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
            Senaste 90 dagarna
          </span>
        </div>
      </ScipxPageHeader>

      <section
        aria-label="Datakällor"
        className="flex flex-col gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950 lg:flex-row lg:items-center lg:justify-between"
      >
        <p className="flex items-start gap-2 leading-6">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-flow-700" aria-hidden="true" />
          <span>
            <strong>Live från {organizationName}:</strong> projekt, produktposter, godkända val och
            sortimentsluckor. Kommersiella KPI:er visas som en demo tills utfall, värde och aktiv tid registreras.
          </span>
        </p>
        <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 font-semibold tabular-nums">
          <span>{projectStatistics.total} projekt</span>
          <span>{businessStatistics.totalProductRequirements} produktposter</span>
          <span>{businessStatistics.productCoverageRate} % produkttäckning</span>
          <span>{businessStatistics.notInAssortmentCount} sortimentsluckor</span>
        </div>
      </section>

      <section aria-label="Kommersiella nyckeltal" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <BusinessMetric
          label="Vunna offerter"
          value="14"
          detail="av 25 avgjorda offerter"
          trend="3 fler än föregående period"
          icon={<Trophy className="h-5 w-5" aria-hidden="true" />}
          tone="green"
        />
        <BusinessMetric
          label="Vinstgrad"
          value="56 %"
          detail="13 offerter är fortfarande öppna"
          trend="+8 procentenheter"
          icon={<Target className="h-5 w-5" aria-hidden="true" />}
          tone="cyan"
        />
        <BusinessMetric
          label="Tid per offert"
          value="41 min"
          detail="från PDF till färdigt underlag"
          trend="2 h 19 min snabbare"
          icon={<Clock3 className="h-5 w-5" aria-hidden="true" />}
          tone="blue"
        />
        <BusinessMetric
          label="Sparad tid"
          value="88 h"
          detail="baserat på 38 offerter"
          trend="cirka 11 arbetsdagar"
          icon={<Zap className="h-5 w-5" aria-hidden="true" />}
          tone="amber"
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
        <PanelHeader
          title="Efterfrågat men inte i sortiment"
          description={hasLiveGaps
            ? "Verkliga poster som användarna har märkt som Inte i sortiment."
            : "Exempel på hur återkommande sortimentsluckor kan prioriteras."
          }
          badge={hasLiveGaps ? "Live data" : "Exempeldata"}
          badgeTone={hasLiveGaps ? "green" : "amber"}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-ink-200 bg-ink-50 text-xs font-bold uppercase tracking-[0.06em] text-ink-500">
              <tr>
                <th className="px-5 py-3.5 sm:px-6">Produkt eller krav</th>
                <th className="px-4 py-3.5">Kategori</th>
                <th className="px-4 py-3.5 text-right">Offerter</th>
                <th className="px-4 py-3.5 text-right">Efterfrågan</th>
                <th className="px-4 py-3.5">Indikerad potential</th>
                <th className="px-5 py-3.5 sm:px-6">Rekommenderad åtgärd</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {gapRows.map((row) => (
                <tr key={`${row.name}-${row.category}`} className="transition hover:bg-ink-50">
                  <td className="max-w-md px-5 py-4 font-semibold text-ink-950 sm:px-6">{row.name}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-ink-600">{row.category}</td>
                  <td className="px-4 py-4 text-right font-semibold tabular-nums text-ink-900">{row.offers}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-ink-700">{row.demand}</td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <Badge tone={row.priority === "high" ? "green" : "teal"}>{row.potential}</Badge>
                  </td>
                  <td className="px-5 py-4 text-ink-700 sm:px-6">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2 border-t border-ink-100 bg-amber-50/60 px-5 py-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>
            {hasLiveGaps
              ? "Potentialen prioriteras efter antal projekt och upprepade behov."
              : "Indikerad potential är illustrativ och ska kopplas till verkligt pris och offertutfall senare."
            }
          </span>
          {!hasLiveGaps && <strong className="tabular-nums">Demo-potential: 907 000 SEK</strong>}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Offertutfall"
            description="Vunna, förlorade och fortfarande öppna offerter per månad."
            badge="Demo"
            badgeTone="amber"
          />
          <div className="p-5 sm:p-6">
            <div className="mb-6 flex flex-wrap items-center gap-5 text-xs font-semibold text-ink-600">
              <Legend color="bg-emerald-500" label="Vunna · 14" />
              <Legend color="bg-rose-400" label="Förlorade · 11" />
              <Legend color="bg-cyan-400" label="Öppna · 13" />
              <span className="ml-auto text-ink-500">38 offerter totalt</span>
            </div>
            <div className="grid h-64 grid-cols-6 gap-3 border-b border-ink-200 px-1 sm:gap-6">
              {DEMO_OUTCOMES.map((row) => (
                <div key={row.month} className="flex min-w-0 flex-col justify-end gap-2">
                  <div className="flex h-52 items-end justify-center gap-1 sm:gap-2" aria-label={`${row.month}: ${row.won} vunna, ${row.lost} förlorade och ${row.open} öppna`}>
                    <ChartBar value={row.won} max={6} color="bg-emerald-500" label={`${row.won}`} />
                    <ChartBar value={row.lost} max={6} color="bg-rose-400" label={`${row.lost}`} />
                    <ChartBar value={row.open} max={6} color="bg-cyan-400" label={`${row.open}`} />
                  </div>
                  <span className="pb-3 text-center text-xs font-semibold text-ink-500">{row.month}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Pipeline just nu"
            description="Var de öppna affärsmöjligheterna befinner sig."
            badge="Demo"
            badgeTone="amber"
          />
          <div className="space-y-5 p-5 sm:p-6">
            {DEMO_PIPELINE.map((row) => (
              <div key={row.label}>
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-ink-800">{row.label}</span>
                  <span className="font-bold tabular-nums text-ink-950">{row.value}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: `${Math.max(18, Math.round((row.value / 13) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-700">Möjlighet</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-emerald-950">
                Fyra offerter är i förhandling. En uppföljning denna vecka kan ge cirka 1,4 MSEK i vunnet värde.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Tidsbruk per offert"
            description="Var de 41 minuterna används i det digitala offertflödet."
            badge="Demo"
            badgeTone="amber"
          />
          <div className="p-5 sm:p-6">
            <div className="mb-6 grid gap-3 sm:grid-cols-3">
              <CompactMetric label="Manuell hantering" value="3 h 00 min" />
              <CompactMetric label="Med Scipx" value="41 min" highlight />
              <CompactMetric label="Tidsvinst" value="77 %" highlight />
            </div>
            <div className="space-y-4">
              {DEMO_TIME_STEPS.map((step) => (
                <div key={step.label} className="grid gap-2 sm:grid-cols-[170px_minmax(0,1fr)_55px] sm:items-center">
                  <span className="text-sm font-medium text-ink-700">{step.label}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={`h-full rounded-full ${step.color}`}
                      style={{ width: `${Math.round((step.minutes / 15) * 100)}%` }}
                    />
                  </div>
                  <span className="text-right text-sm font-bold tabular-nums text-ink-950">{step.minutes} min</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Att agera på nu"
            description="Möjligheter som en affärsutvecklare kan driva vidare."
          />
          <div className="divide-y divide-ink-100">
            <Opportunity
              icon={<PackageSearch className="h-5 w-5" aria-hidden="true" />}
              title="Stäng de största sortimentsluckorna"
              impact={hasLiveGaps
                ? `${businessStatistics.notInAssortmentCount} verkliga poster behöver sortimentsbeslut`
                : "Fem återkommande behov motsvarar 907 000 SEK"
              }
              action="Skicka topp-listan till kategori och inköp"
            />
            <Opportunity
              icon={<Award className="h-5 w-5" aria-hidden="true" />}
              title="Följ upp gamla öppna offerter"
              impact="Sex offerter har varit öppna längre än 14 dagar"
              action="Prioritera de tre med högst affärsvärde"
            />
            <Opportunity
              icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
              title="Återanvänd vinnande produktpaket"
              impact="Sprinklerprojekt med verifierade val vinner 8 procentenheter oftare"
              action="Gör de mest använda kombinationerna till standard"
            />
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
        <PanelHeader
          title="Senaste projektaktivitet"
          description="Liveprojekt som kan behöva kommersiell uppföljning."
          badge={`${projectStatistics.ongoing} pågående`}
          badgeTone="teal"
        />
        {projects.length === 0 ? (
          <div className="px-5 py-12 text-center sm:px-6">
            <BriefcaseBusiness className="mx-auto h-8 w-8 text-ink-300" aria-hidden="true" />
            <p className="mt-3 font-medium text-ink-800">Inga projekt att visa ännu</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {projects.slice(0, 5).map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-ink-50 sm:px-6"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-950">{project.name}</span>
                  <span className="mt-1 block text-sm text-ink-500">
                    {project.project_number || "Utan projektnummer"} · {statusLabel(project)} · uppdaterat {formatDate(project.updated_at)}
                  </span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-ink-400 transition group-hover:translate-x-1 group-hover:text-flow-700" aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BusinessMetric({ label, value, detail, trend, icon, tone }: {
  label: string;
  value: string;
  detail: string;
  trend: string;
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
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-2 text-sm text-ink-500">{detail}</p>
      <p className="mt-4 flex items-center gap-1.5 text-xs font-bold text-emerald-700">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />{trend}
      </p>
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

function ChartBar({ value, max, color, label }: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  return (
    <div className="flex h-full w-3 flex-col justify-end sm:w-7">
      {value > 0 && <span className="mb-1 text-center text-[10px] font-bold tabular-nums text-ink-500">{label}</span>}
      <span className={`block min-h-0 rounded-t-md ${color}`} style={{ height: value > 0 ? `${Math.max(10, Math.round((value / max) * 100))}%` : 0 }} />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} aria-hidden="true" />{label}</span>;
}

function CompactMetric({ label, value, highlight = false }: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-cyan-200 bg-cyan-50" : "border-ink-200 bg-ink-50"}`}>
      <p className="text-xs font-semibold text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-black tabular-nums ${highlight ? "text-flow-800" : "text-ink-950"}`}>{value}</p>
    </div>
  );
}

function Opportunity({ icon, title, impact, action }: {
  icon: React.ReactNode;
  title: string;
  impact: string;
  action: string;
}) {
  return (
    <article className="flex gap-4 px-5 py-5 sm:px-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-flow-50 text-flow-700 ring-1 ring-flow-200">{icon}</span>
      <div className="min-w-0">
        <h3 className="font-bold text-ink-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-ink-600">{impact}</p>
        <p className="mt-2 flex items-start gap-1.5 text-xs font-bold text-flow-800">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{action}
        </p>
      </div>
    </article>
  );
}

function liveGapRow(row: ProductGapOpportunity): GapRow {
  return {
    name: row.name,
    category: row.category,
    offers: row.projectCount,
    demand: row.quantity !== null && row.unit
      ? `${formatNumber(row.quantity)} ${row.unit}`
      : `${row.occurrences} ${row.occurrences === 1 ? "post" : "poster"}`,
    potential: row.priority === "high" ? "Hög potential" : row.priority === "medium" ? "Medelpotential" : "Bevaka",
    action: row.recommendedAction,
    priority: row.priority
  };
}

function statusLabel(project: DashboardProject) {
  if (project.status === "archived") return "Arkiverat";
  return PROJECT_STAGES.find(([stage]) => stage === project.current_stage)?.[1] ?? "Projektinformation";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(value);
}
