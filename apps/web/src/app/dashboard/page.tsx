import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderOpen,
  PackageCheck,
  ScanText
} from "lucide-react";
import { getOrganizationContext } from "@/lib/organization-context";
import { selectUserRows } from "@/lib/supabase-user-rest";
import type { OrganizationProject } from "@/types/organization";

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
  const availableProjects = canViewProjects
    ? await selectUserRows<OrganizationProject>("projects", {
        select: "id,name,project_number,status,current_stage,updated_at,organization_id,access_level,created_at",
        organization_id: `eq.${context.organization.id}`,
        deleted_at: "is.null",
        order: "updated_at.desc",
        limit: "50"
      })
    : [];
  const openProjects = availableProjects.filter(isOpenProject);
  const latestOpenProject = openProjects[0];

  return (
    <div className="scipx-dashboard-frame mx-auto max-w-[1500px]">
      <section className="relative isolate h-full overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[#03162d] text-white shadow-[0_24px_70px_rgba(2,17,38,0.25)]">
        <BlueprintBackdrop />
        <div className="relative grid h-full lg:grid-cols-[minmax(0,1.02fr)_minmax(380px,0.98fr)]">
          <div className="scipx-dashboard-content flex h-full flex-col justify-center p-5 sm:p-7 lg:p-8 xl:p-10 2xl:p-12">
            <div>
              <BrandLockup />
              <p className="scipx-dashboard-eyebrow mt-5 max-w-2xl text-xs font-bold uppercase tracking-[0.2em] text-cyan-300 sm:text-sm">
                Från PDF till produktval
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-black leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl xl:text-[3.15rem]">
                Ladda upp PDF.
                <span className="block text-cyan-300">Scipx ordnar resten.</span>
              </h1>
              <p className="scipx-dashboard-description mt-4 max-w-xl text-sm leading-6 text-slate-200 sm:text-base sm:leading-7">
                Scipx läser postnummer, specifikationer och mängder. Ni väljer
                rätt Ahlsell-artiklar och laddar ned sammanställningen i Excel
                eller PDF.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
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
                    className="scipx-dashboard-secondary inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/[0.08] px-5 text-base font-bold text-white backdrop-blur transition hover:border-cyan-300/70 hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-cyan-200"
                  >
                    <FolderOpen className="h-5 w-5" aria-hidden="true" />
                    Öppna tidigare projekt
                  </Link>
                )}
              </div>
              <p className="scipx-dashboard-helper mt-3 flex items-center gap-2 text-sm font-medium text-cyan-100">
                <CheckCircle2 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
                Börja här – projektet skapas automatiskt från din PDF
              </p>
            </div>

            {latestOpenProject ? (
              <div className="lg:hidden">
                <OpenProjectCard project={latestOpenProject} total={openProjects.length} />
              </div>
            ) : (
              <div className="scipx-dashboard-capabilities mt-8 grid max-w-2xl grid-cols-2 gap-x-4 gap-y-5 border-t border-cyan-200/20 pt-5 sm:grid-cols-4">
                <Capability icon={<ScanText />} label="Texten läses" />
                <Capability icon={<FileText />} label="Poster hittas" />
                <Capability icon={<PackageCheck />} label="Produkt väljs" />
                <Capability icon={<FileSpreadsheet />} label="Underlag skapas" />
              </div>
            )}
          </div>

          <div className="scipx-dashboard-visual relative items-center justify-center border-t border-cyan-200/15 bg-[#021227]/35 p-6 sm:p-8 lg:border-l lg:border-t-0 xl:p-10">
            {latestOpenProject ? (
              <OpenProjectsPanel projects={openProjects.slice(0, 3)} total={openProjects.length} />
            ) : (
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
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function OpenProjectsPanel({ projects, total }: { projects: OrganizationProject[]; total: number }) {
  const [primary, ...secondary] = projects;
  if (!primary) return null;
  const continuation = projectContinuation(primary);
  return (
    <section className="relative w-full max-w-[570px] rounded-[24px] border border-cyan-300/30 bg-white p-6 text-[#10233d] shadow-[0_24px_65px_rgba(0,0,0,0.3)] xl:p-8">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#007598]"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />Pågående projekt</p>
          <h2 className="mt-1 text-2xl font-black text-[#06213d]">Fortsätt där du slutade</h2>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1.5 text-sm font-black text-[#006b91]">{total} öppna</span>
      </div>

      <div className="mt-5 rounded-2xl border-2 border-cyan-300 bg-cyan-50/60 p-5">
        <p className="text-xs font-black uppercase tracking-[0.1em] text-[#007598]">Senast använt</p>
        <h3 className="mt-2 line-clamp-2 text-xl font-black leading-7 text-[#06213d]">{primary.name}</h3>
        <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-600"><Clock3 className="h-4 w-4" aria-hidden="true" />Nästa steg: {continuation.label}</p>
        <Link href={continuation.href} className="group mt-5 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#06213d] px-5 text-lg font-black text-white transition hover:bg-[#0a3156] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-500">
          Fortsätt projektet
          <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>

      {secondary.length > 0 && (
        <div className="mt-4 space-y-2">
          {secondary.map((project) => {
            const next = projectContinuation(project);
            return <Link key={project.id} href={next.href} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-2.5 transition hover:border-cyan-400 hover:bg-cyan-50"><span className="min-w-0 truncate text-sm font-bold text-slate-800">{project.name}</span><span className="shrink-0 text-xs font-bold text-[#007598]">Fortsätt →</span></Link>;
          })}
        </div>
      )}

      <Link href="/projects" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-black text-[#006b91] underline decoration-2 underline-offset-4 hover:text-[#004f70]"><FolderOpen className="h-4 w-4" aria-hidden="true" />Visa alla projekt</Link>
    </section>
  );
}

function OpenProjectCard({ project, total }: { project: OrganizationProject; total: number }) {
  const continuation = projectContinuation(project);
  return (
    <section className="scipx-dashboard-open-project mt-6 max-w-2xl rounded-2xl border-2 border-cyan-300 bg-white p-4 text-[#10233d] shadow-[0_14px_35px_rgba(0,0,0,0.22)] sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[#007598]"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />Pågående projekt</span>
            {total > 1 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{total} öppna</span>}
          </div>
          <h2 className="mt-2 truncate text-lg font-black sm:text-xl">{project.name}</h2>
          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-600"><Clock3 className="h-4 w-4 shrink-0" aria-hidden="true" />Nästa steg: {continuation.label}</p>
        </div>
        <Link href={continuation.href} className="group inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#06213d] px-5 text-base font-black text-white transition hover:bg-[#0a3156] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-cyan-500">
          Fortsätt projektet
          <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </div>
      {total > 1 && <Link href="/projects" className="mt-3 inline-flex text-sm font-bold text-[#007598] underline decoration-2 underline-offset-4 hover:text-[#004f70]">Visa alla pågående projekt</Link>}
    </section>
  );
}

function isOpenProject(project: OrganizationProject) {
  return project.current_stage !== "completed" && !["completed", "archived"].includes(project.status);
}

function projectContinuation(project: OrganizationProject) {
  const stage = project.current_stage ?? "documents";
  if (["setup", "documents", "technical_description"].includes(stage)) {
    return { href: `/projects/${project.id}?step=documents`, label: "Ladda upp PDF" };
  }
  if (["requirements_review", "analysis", "product_matching"].includes(stage)) {
    return { href: `/projects/${project.id}?step=products`, label: "Välj produkter" };
  }
  return { href: `/projects/${project.id}`, label: "Visa sammanfattningen" };
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
