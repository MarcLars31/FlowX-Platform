import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderOpen,
  PackageCheck,
  ScanText,
  Sparkles
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

type ProjectRow = {
  id: string;
  name: string;
  updated_at: string;
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
      ? selectUserRows<ProjectRow>("projects", {
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
    <div className="mx-auto max-w-[1500px] space-y-8">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#03162d] text-white shadow-[0_24px_70px_rgba(2,17,38,0.25)]">
        <BlueprintBackdrop />
        <div className="relative grid min-h-[610px] lg:grid-cols-[minmax(0,1.02fr)_minmax(380px,0.98fr)]">
          <div className="flex flex-col justify-between p-6 sm:p-9 lg:p-12 xl:p-14">
            <div>
              <BrandLockup />
              <p className="mt-7 max-w-2xl text-xs font-bold uppercase tracking-[0.2em] text-cyan-300 sm:text-sm">
                Från PDF till produktval
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-black leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl xl:text-[3.15rem]">
                Ladda upp PDF.
                <span className="block text-cyan-300">Scipx ordnar resten.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-200">
                Scipx läser postnummer, specifikationer och mängder. Ni väljer
                rätt Ahlsell-artiklar och laddar ned sammanställningen i Excel
                eller PDF.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                {canCreateProject && (
                  <Link
                    href="/projects/new"
                    className="group inline-flex min-h-14 items-center justify-center gap-3 rounded-xl bg-cyan-400 px-6 text-base font-extrabold text-[#03162d] shadow-[0_0_28px_rgba(34,211,238,0.28)] transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
                  >
                    <FileUp className="h-5 w-5" aria-hidden="true" />
                    Ladda upp teknisk beskrivning
                    <ArrowRight
                      className="h-5 w-5 transition group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </Link>
                )}
                {canViewProjects && (
                  <Link
                    href="/projects"
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/[0.08] px-5 text-base font-bold text-white backdrop-blur transition hover:border-cyan-300/70 hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
                  >
                    <FolderOpen className="h-5 w-5" aria-hidden="true" />
                    Öppna tidigare projekt
                  </Link>
                )}
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-cyan-100">
                <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                Börja här – projektet skapas automatiskt från din PDF
              </p>
            </div>

            <div className="mt-12 grid max-w-2xl grid-cols-2 gap-x-4 gap-y-5 border-t border-cyan-200/20 pt-7 sm:grid-cols-4">
              <Capability icon={<ScanText />} label="Texten läses" />
              <Capability icon={<FileText />} label="Poster hittas" />
              <Capability icon={<PackageCheck />} label="Produkt väljs" />
              <Capability icon={<FileSpreadsheet />} label="Underlag skapas" />
            </div>
          </div>

          <div className="relative flex min-h-[490px] items-center justify-center border-t border-cyan-200/15 bg-[#021227]/35 p-6 sm:p-10 lg:min-h-full lg:border-l lg:border-t-0 xl:p-14">
            <div className="relative w-full max-w-[570px]">
              <div className="absolute -inset-10 rounded-full bg-cyan-400/10 blur-3xl" />
              <div className="relative grid gap-4 sm:grid-cols-[minmax(135px,0.92fr)_40px_minmax(155px,1.08fr)] sm:items-center">
                <DocumentPreview />
                <div className="hidden justify-center sm:flex" aria-hidden="true">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/50 bg-cyan-400/15 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.38)]">
                    <ArrowRight className="h-5 w-5" />
                  </span>
                </div>
                <ProductPreview />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="sa-fungerar-scipx" className="space-y-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#0073b6]">
            En enkel väg från start till mål
          </p>
          <h2 id="sa-fungerar-scipx" className="mt-1 text-2xl font-black text-ink-950 sm:text-3xl">
            Så fungerar Scipx
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <FlowCard
            number="1"
            title="Ladda upp PDF"
            description="Välj den tekniska beskrivningen. Scipx skapar projektet och läser ut alla produktrader."
            action={canCreateProject ? { href: "/projects/new", label: "Starta ett nytt projekt" } : undefined}
          />
          <FlowCard
            number="2"
            title="Välj rätt artikel"
            description="Kontrollera postnummer, mängd och specifikationer. Fyll sedan i Ahlsells produkt och artikelnummer."
          />
          <FlowCard
            number="3"
            title="Ladda ner resultatet"
            description="Granska sammanfattningen och ladda ner den färdiga materiallistan som Excel eller PDF."
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                Fortsätt där du slutade
              </p>
              <h2 className="mt-1 text-xl font-black text-ink-950">Senaste projekt</h2>
            </div>
            {canViewProjects && (
              <Link
                href="/projects"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-[#00649e] hover:bg-[#0073b6]/5"
              >
                Visa alla projekt <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
          <div className="mt-5 space-y-2">
            {projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50 p-6 text-center">
                <FileUp className="mx-auto h-7 w-7 text-[#0073b6]" aria-hidden="true" />
                <p className="mt-3 font-bold text-ink-900">Inga projekt ännu</p>
                <p className="mt-1 text-sm text-ink-600">Ladda upp din första tekniska beskrivning för att börja.</p>
              </div>
            ) : (
              projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="group flex min-h-16 items-center justify-between gap-4 rounded-xl border border-transparent bg-ink-50 px-4 py-3 transition hover:border-[#0073b6]/25 hover:bg-[#0073b6]/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink-950 group-hover:text-[#00649e]">
                      {project.name}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Senast ändrad {formatDate(project.updated_at)}
                    </span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#0073b6] shadow-sm transition group-hover:translate-x-1">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-[#0073b6]">
              <BrainCircuit className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-500">
                Produktminne
              </p>
              <h2 className="mt-1 text-xl font-black text-ink-950">Tidigare produktval</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-ink-600">
            Scipx kommer ihåg verifierade val och kan föreslå samma artikel nästa gång ett liknande krav hittas.
          </p>
          <div className="mt-4 space-y-2">
            {memories.length === 0 ? (
              <p className="rounded-xl bg-ink-50 p-5 text-sm leading-6 text-ink-600">
                Här visas produktval när den första sammanställningen är färdig.
              </p>
            ) : (
              memories.slice(0, 3).map((memory) => (
                <div key={memory.id} className="flex items-center justify-between gap-4 rounded-xl bg-ink-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-950">{memory.product_name}</p>
                    <p className="mt-1 truncate text-xs text-ink-500">
                      Art.nr {memory.product_number}
                      {memory.manufacturer_name ? ` · ${memory.manufacturer_name}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-bold text-[#00649e]">
                    {memory.usage_count} val
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <footer className="flex flex-col gap-3 rounded-2xl bg-[#06182f] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/ahlsell-logo.svg" alt="Ahlsell" className="h-8 w-auto rounded bg-white px-2 py-1" />
          <p className="text-sm text-slate-300">Scipx konceptmiljö för Ahlsell</p>
        </div>
        <p className="text-xs text-slate-400">Produktval ska alltid verifieras av ansvarig specialist.</p>
      </footer>
    </div>
  );
}

function BrandLockup() {
  return (
    <div className="inline-flex items-center" aria-label="Scipx">
      <span className="text-4xl font-black tracking-[0.02em] text-white sm:text-6xl">SCIP</span>
      <span className="-ml-1 text-5xl font-black leading-none text-cyan-300 sm:text-7xl">X</span>
    </div>
  );
}

function BlueprintBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(66,173,217,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(66,173,217,0.075)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_48%,rgba(20,180,225,0.16),transparent_34%),linear-gradient(90deg,rgba(3,22,45,0.05),rgba(3,22,45,0.66))]" />
      <svg className="absolute -left-20 top-5 h-72 w-[520px] text-cyan-200/15" viewBox="0 0 520 280" fill="none">
        <path d="M5 45h148v54h70v66h94v-38h170" stroke="currentColor" strokeWidth="3" />
        <path d="M4 52h141v54h70v66h110v-38h162" stroke="currentColor" />
        <circle cx="153" cy="102" r="16" stroke="currentColor" strokeWidth="2" />
        <circle cx="218" cy="168" r="15" stroke="currentColor" strokeWidth="2" />
        <path d="M317 116v36M337 116v36M327 152v40" stroke="currentColor" />
        <path d="M359 192h-65M350 200h-47" stroke="currentColor" />
      </svg>
      <svg className="absolute -bottom-12 right-0 h-64 w-[620px] text-cyan-200/10" viewBox="0 0 620 250" fill="none">
        <path d="M0 176h137v-46h91v46h132v-72h86v72h174" stroke="currentColor" strokeWidth="3" />
        <path d="M0 184h145v-46h75v46h148v-72h70v72h182" stroke="currentColor" />
        <circle cx="183" cy="180" r="49" stroke="currentColor" strokeWidth="2" />
        <circle cx="404" cy="180" r="61" stroke="currentColor" strokeWidth="2" />
        <circle cx="404" cy="180" r="34" stroke="currentColor" />
      </svg>
    </div>
  );
}

function Capability({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm font-bold text-slate-200 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-cyan-300">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function DocumentPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[195px] rotate-[-3deg] sm:mx-0">
      <div className="absolute -inset-x-2 inset-y-3 rotate-6 rounded-xl border border-white/15 bg-white/10" />
      <div className="relative rounded-xl border border-white/50 bg-slate-50 p-5 text-[#12243c] shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-xs font-black text-white">PDF</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Teknisk beskrivning</span>
        </div>
        <div className="mt-5 space-y-4">
          <DocumentLine title="33.335.1" text="Sprinklerhuvud · K80 · 68 °C" />
          <DocumentLine title="33.335.2" text="Alarmventil · DN150 · 16 bar" />
          <DocumentLine title="33.335.3" text="Rör · DN100 · 124 meter" />
        </div>
        <p className="mt-5 border-t border-slate-200 pt-3 text-[10px] font-semibold text-slate-400">PDF-underlag</p>
      </div>
    </div>
  );
}

function DocumentLine({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-[11px] font-black">{title}</p>
      <p className="mt-0.5 text-[10px] leading-4 text-slate-600">{text}</p>
      <span className="mt-2 block h-1 rounded-full bg-slate-200" />
    </div>
  );
}

function ProductPreview() {
  return (
    <div className="space-y-3">
      <PreviewCard label="INSTALLATION" title="Sprinklerhuvud" details={["K-faktor 80", "68 °C", "Antal 24 st"]} />
      <PreviewCard label="INSTALLATION" title="Alarmventil" details={["DN150", "16 bar", "Antal 1 st"]} />
      <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-[#3c2c18] shadow-[0_12px_30px_rgba(0,0,0,0.18)]">
        <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Befintligt</p>
        <p className="mt-2 text-sm font-black">Rivning</p>
        <p className="mt-1 text-[11px] leading-4 text-amber-950/70">Identifierad separat från nya produktval.</p>
      </div>
    </div>
  );
}

function PreviewCard({
  label,
  title,
  details
}: {
  label: string;
  title: string;
  details: string[];
}) {
  return (
    <div className="rounded-xl border border-cyan-300/60 bg-white p-4 text-[#10233d] shadow-[0_12px_30px_rgba(0,0,0,0.22),0_0_18px_rgba(34,211,238,0.12)]">
      <span className="rounded border border-cyan-400 px-2 py-1 text-[9px] font-black tracking-wider text-[#007aa8]">{label}</span>
      <p className="mt-3 text-sm font-black">{title}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-600">{details.join(" · ")}</p>
      <p className="mt-3 flex items-center gap-1.5 text-[10px] font-black uppercase text-[#0087aa]">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-white">
          <Check className="h-2.5 w-2.5" aria-hidden="true" />
        </span>
        Klar för produktval
      </p>
    </div>
  );
}

function FlowCard({
  number,
  title,
  description,
  action
}: {
  number: string;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-7">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0073b6] text-lg font-black text-white shadow-[0_8px_20px_rgba(0,115,182,0.22)]">
          {number}
        </span>
        <div>
          <h3 className="text-lg font-black text-ink-950">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
          {action && (
            <Link href={action.href} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[#00649e] hover:underline">
              {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <Sparkles className="absolute -bottom-3 -right-3 h-20 w-20 text-[#0073b6]/5" aria-hidden="true" />
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value));
}
