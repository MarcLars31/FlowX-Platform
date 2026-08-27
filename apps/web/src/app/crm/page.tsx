import Link from "next/link";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  Handshake,
  Lightbulb,
  PackageSearch,
  Target,
  TrendingUp,
  UserRound
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { ScipxPageHeader } from "@/components/ScipxPageHeader";

const opportunities = [
  {
    customer: "Assemblin",
    project: "Sjukhus etapp 2",
    phase: "Förhandling",
    value: "2,10 MSEK",
    probability: 75,
    nextStep: "Prisgenomgång · 28 aug",
    owner: "Marcus"
  },
  {
    customer: "Nordbygg AS",
    project: "Vågå svømmehall",
    phase: "Offert skickad",
    value: "1,40 MSEK",
    probability: 65,
    nextStep: "Ring inköpsansvarig · idag",
    owner: "Daniel"
  },
  {
    customer: "Caverion Sverige",
    project: "Kv. Orion",
    phase: "Produktval",
    value: "0,98 MSEK",
    probability: 55,
    nextStep: "Bekräfta tre NRF-nummer · 29 aug",
    owner: "Marcus"
  },
  {
    customer: "Bravida",
    project: "Västra kajen",
    phase: "Kvalificering",
    value: "0,72 MSEK",
    probability: 40,
    nextStep: "Boka behovsmöte · 30 aug",
    owner: "Daniel"
  },
  {
    customer: "GK Rör",
    project: "Logistikcenter Nord",
    phase: "Ny möjlighet",
    value: "0,55 MSEK",
    probability: 25,
    nextStep: "Granska teknisk PDF · 2 sep",
    owner: "Marcus"
  }
] as const;

const pipeline = [
  { label: "Nya möjligheter", count: 6, value: "1,2 MSEK", width: 100, color: "bg-cyan-400" },
  { label: "Kvalificerade", count: 5, value: "2,0 MSEK", width: 84, color: "bg-sky-500" },
  { label: "Offert / produktval", count: 6, value: "3,8 MSEK", width: 68, color: "bg-blue-600" },
  { label: "Förhandling", count: 4, value: "2,4 MSEK", width: 48, color: "bg-indigo-600" },
  { label: "Vunna denna månad", count: 3, value: "3,2 MSEK", width: 36, color: "bg-emerald-500" }
] as const;

const activities = [
  { time: "09:30", title: "Ring Nordbygg AS", detail: "Följ upp Vågå svømmehall", overdue: true },
  { time: "11:00", title: "Sortimentsmöte med kategori", detail: "Flexibel sprinklerslang och K80 upright", overdue: false },
  { time: "13:30", title: "Prisgenomgång med Assemblin", detail: "Sjukhus etapp 2 · 2,10 MSEK", overdue: false },
  { time: "15:00", title: "Skicka reviderad offert", detail: "Caverion · Kv. Orion", overdue: false }
] as const;

export default function CrmPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <ScipxPageHeader
        eyebrow="Kund och affärer"
        title="CRM"
        description="Samla kunder, affärsmöjligheter och nästa aktiviteter på ett ställe."
        icon={<Handshake aria-hidden="true" />}
      >
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <Badge tone="amber">DEMO · Exempeldata</Badge>
          <Link
            href="/statistics"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 text-sm font-bold text-white transition hover:bg-white/15"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Se statistik
          </Link>
        </div>
      </ScipxPageHeader>

      <section aria-label="CRM-nyckeltal" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CrmMetric
          label="Öppen pipeline"
          value="8,4 MSEK"
          detail="21 aktiva möjligheter"
          trend="+12 % mot föregående period"
          icon={<BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />}
          tone="cyan"
        />
        <CrmMetric
          label="Viktat värde"
          value="4,7 MSEK"
          detail="baserat på sannolikhet"
          trend="56 % genomsnittlig sannolikhet"
          icon={<Target className="h-5 w-5" aria-hidden="true" />}
          tone="blue"
        />
        <CrmMetric
          label="Uppföljningar idag"
          value="7"
          detail="2 aktiviteter är försenade"
          trend="5 planerade under dagen"
          icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
          tone="amber"
        />
        <CrmMetric
          label="Vunnet denna månad"
          value="3,2 MSEK"
          detail="3 vunna affärer"
          trend="+0,8 MSEK mot förra månaden"
          icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
          tone="green"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.55fr)]">
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Affärsmöjligheter"
            description="De viktigaste öppna affärerna och vad som behöver hända härnäst."
            badge="5 prioriterade"
            badgeTone="teal"
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-ink-200 bg-ink-50 text-xs font-bold uppercase tracking-[0.06em] text-ink-500">
                <tr>
                  <th className="px-5 py-3.5 sm:px-6">Kund och projekt</th>
                  <th className="px-4 py-3.5">Fas</th>
                  <th className="px-4 py-3.5 text-right">Värde</th>
                  <th className="px-4 py-3.5 text-right">Sannolikhet</th>
                  <th className="px-4 py-3.5">Nästa steg</th>
                  <th className="px-5 py-3.5 sm:px-6">Ansvarig</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {opportunities.map((opportunity) => (
                  <tr key={`${opportunity.customer}-${opportunity.project}`} className="transition hover:bg-ink-50">
                    <td className="px-5 py-4 sm:px-6">
                      <p className="font-bold text-ink-950">{opportunity.customer}</p>
                      <p className="mt-1 text-xs text-ink-500">{opportunity.project}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Badge tone={phaseTone(opportunity.phase)}>{opportunity.phase}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-bold tabular-nums text-ink-950">{opportunity.value}</td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-bold tabular-nums text-ink-900">{opportunity.probability} %</span>
                      <span className="mt-1 block h-1.5 w-20 overflow-hidden rounded-full bg-ink-100">
                        <span className="block h-full rounded-full bg-flow-500" style={{ width: `${opportunity.probability}%` }} />
                      </span>
                    </td>
                    <td className="min-w-56 px-4 py-4 text-ink-700">{opportunity.nextStep}</td>
                    <td className="px-5 py-4 sm:px-6">
                      <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold text-ink-700">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-flow-50 text-flow-700">
                          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        {opportunity.owner}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Försäljningspipeline"
            description="Antal och värde per affärsfas."
            badge="Demo"
            badgeTone="amber"
          />
          <div className="space-y-5 p-5 sm:p-6">
            {pipeline.map((stage) => (
              <div key={stage.label}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink-800">{stage.label}</span>
                  <span className="whitespace-nowrap text-right tabular-nums text-ink-600">
                    <strong className="text-ink-950">{stage.count}</strong> · {stage.value}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
                  <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${stage.width}%` }} />
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-700">Prognos</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-emerald-950">
                4,7 MSEK i viktad pipeline. Förhandlingarna står för den snabbaste möjligheten till avslut.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Dagens aktiviteter"
            description="Uppföljningar som flyttar affärerna framåt."
            badge="2 försenade"
            badgeTone="amber"
          />
          <div className="divide-y divide-ink-100">
            {activities.map((activity) => (
              <article key={`${activity.time}-${activity.title}`} className="flex gap-4 px-5 py-4 sm:px-6">
                <span className={`flex h-10 w-16 shrink-0 items-center justify-center rounded-lg text-sm font-black tabular-nums ${activity.overdue ? "bg-rose-50 text-rose-700" : "bg-flow-50 text-flow-700"}`}>
                  {activity.time}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-ink-950">{activity.title}</h3>
                    {activity.overdue && <Badge tone="rose">Försenad</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink-600">{activity.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-cyan-900/10 bg-white shadow-sm">
          <PanelHeader
            title="Kundsignaler från Scipx"
            description="Projekt- och produktdata som kan bli nästa säljrörelse."
            badge="Demo"
            badgeTone="amber"
          />
          <div className="divide-y divide-ink-100">
            <CustomerSignal
              icon={<PackageSearch className="h-5 w-5" aria-hidden="true" />}
              title="Återkommande sortimentslucka"
              detail="Flexibel sprinklerslang DN25 efterfrågas i åtta offerter."
              action="Skapa kategoriärende och kontakta de tre största kunderna"
            />
            <CustomerSignal
              icon={<CircleDollarSign className="h-5 w-5" aria-hidden="true" />}
              title="Högt värde utan aktivitet"
              detail="Två offerter över 1 MSEK saknar uppföljning de senaste sju dagarna."
              action="Planera samtal med ansvarig inköpare"
            />
            <CustomerSignal
              icon={<Clock3 className="h-5 w-5" aria-hidden="true" />}
              title="Snabbare svar ger högre vinstgrad"
              detail="Affärer besvarade inom två timmar vinner oftare i demoanalysen."
              action="Prioritera nya PDF-förfrågningar samma dag"
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function CrmMetric({ label, value, detail, trend, icon, tone }: {
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
    <article className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
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

function CustomerSignal({ icon, title, detail, action }: {
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

function phaseTone(phase: string): "green" | "teal" | "blue" | "amber" | "slate" {
  if (phase === "Förhandling") return "green";
  if (phase === "Offert skickad") return "teal";
  if (phase === "Produktval") return "blue";
  if (phase === "Kvalificering") return "amber";
  return "slate";
}
