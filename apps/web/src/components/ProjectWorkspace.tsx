"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FilePlus2,
  FileText,
  FolderKanban,
  LayoutDashboard,
  PackageSearch,
  Save,
  Upload
} from "lucide-react";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { DistributorMappingPanel } from "@/components/DistributorMappingPanel";
import { Input } from "@/components/Input";
import { ProjectMaterialListExportButton } from "@/components/ProjectMaterialListExportButton";
import type { OrganizationProject } from "@/types/organization";
import { PROJECT_STAGES } from "@/lib/project-governance";
import {
  formatProjectQuantity,
  projectRequirementQuantity
} from "@/lib/project-requirement-quantity";
import {
  GUIDED_PROJECT_STEPS,
  guidedProjectCompletionUpdate,
  guidedProjectWorkflow,
  type GuidedProjectTab
} from "@/lib/guided-project-workflow";

export type ProjectModuleData = {
  project: OrganizationProject;
  systemTypes: ProjectRow[];
  standards: ProjectRow[];
  suppliers: ProjectRow[];
  documents: ProjectRow[];
  technicalDescriptions: ProjectRow[];
  requirements: ProjectRow[];
  conflicts: ProjectRow[];
  suggestions: ProjectRow[];
  decisions: ProjectRow[];
  mappingMemories: ProjectRow[];
  mappingAccessories: ProjectRow[];
};

type ProjectRow = Record<string, unknown> & { id: string };
type Tab = "overview" | "documents" | "products" | "decisions";

const statusLabels: Record<string, string> = {
  draft: "Utkast",
  analysis: "Under analys",
  awaiting_input: "Väntar på underlag",
  proposal_ready: "Produktförslag klart",
  in_review: "Under granskning",
  approved: "Godkänt",
  quoted: "Offererat",
  ordered: "Beställt",
  delivered: "Levererat",
  archived: "Arkiverat",
  active: "Aktivt"
};

export function ProjectWorkspace({
  initialData,
  initialTab = "overview",
  canExportMaterialList = false,
  canCreateProject = false
}: {
  initialData: ProjectModuleData;
  initialTab?: GuidedProjectTab;
  canExportMaterialList?: boolean;
  canCreateProject?: boolean;
}) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    if (nextTab === "documents") {
      void advanceProjectStage("documents");
    } else if (nextTab === "products" && data.requirements.length > 0) {
      void advanceProjectStage("product_matching");
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (nextTab === "overview") url.searchParams.delete("step");
      else url.searchParams.set("step", nextTab);
      window.history.replaceState(window.history.state, "", url);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function advanceProjectStage(targetStage: string) {
    const currentIndex = PROJECT_STAGES.findIndex(
      ([stage]) => stage === data.project.current_stage
    );
    const targetIndex = PROJECT_STAGES.findIndex(([stage]) => stage === targetStage);
    if (targetIndex < 0 || currentIndex >= targetIndex) return;

    try {
      const response = await fetch(`/api/projects/${data.project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStage: targetStage })
      });
      const payload = (await response.json().catch(() => null)) as
        | { project?: OrganizationProject }
        | null;
      if (response.ok && payload?.project) {
        setData((current) => ({
          ...current,
          project: payload.project as OrganizationProject
        }));
      }
    } catch {
      // The guided UI still works for read-only users and during transient network errors.
    }
  }

  async function finishProject() {
    if (data.project.current_stage === "completed") {
      setError(null);
      setMessage("Produktvalet är klart. Projektsammanfattningen visas nedan.");
      selectTab("overview");
      return;
    }

    const completionUpdate = guidedProjectCompletionUpdate(workflow);
    if (!completionUpdate) {
      setMessage(null);
      setError("Alla krav måste ha ett registrerat produktval innan projektet kan slutföras.");
      return;
    }

    setFinishing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${data.project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(completionUpdate)
      });
      const payload = (await response.json().catch(() => null)) as
        | { project?: OrganizationProject; error?: string }
        | null;
      if (!response.ok || !payload?.project) {
        throw new Error(payload?.error ?? "Projektet kunde inte slutföras.");
      }
      setData((current) => ({
        ...current,
        project: payload.project as OrganizationProject
      }));
      setMessage(
        "Produktvalet är klart. Projektet är markerat som produktförslag klart och sammanfattningen visas nedan."
      );
      selectTab("overview");
    } catch (finishError) {
      setError(
        finishError instanceof Error
          ? finishError.message
          : "Projektet kunde inte slutföras."
      );
    } finally {
      setFinishing(false);
    }
  }

  async function reload() {
    const response = await fetch(`/api/projects/${data.project.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Projektdata kunde inte laddas om.");
    const payload = (await response.json()) as {
      project: OrganizationProject;
      systemTypes: ProjectRow[];
      standards: ProjectRow[];
      suppliers: ProjectRow[];
      documents: ProjectRow[];
      technicalDescriptions: ProjectRow[];
      requirements: ProjectRow[];
      conflicts: ProjectRow[];
      suggestions: ProjectRow[];
      decisions: ProjectRow[];
      mappingMemories: ProjectRow[];
      mappingAccessories: ProjectRow[];
    };
    setData(payload);
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/projects/${data.project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          projectNumber: form.get("projectNumber"),
          customerName: form.get("customerName"),
          endCustomer: form.get("endCustomer"),
          address: form.get("address"),
          status: form.get("status"),
          currentStage:
            data.project.current_stage === "setup"
              ? "documents"
              : data.project.current_stage,
          projectType: form.get("projectType"),
          // The streamlined Ahlsell workspace does not render this legacy
          // field. Preserve the stored value instead of sending FormData's
          // null sentinel, which the API correctly rejects as non-text.
          procurementStrategy: data.project.procurement_strategy ?? "",
          currency: form.get("currency"),
          deliveryCountry: form.get("deliveryCountry"),
          warehouseLocation: form.get("warehouseLocation"),
          standard: form.get("standard"),
          systemType: form.get("systemType"),
          expectedStartDate: form.get("expectedStartDate") || null,
          expectedDeliveryDate: form.get("expectedDeliveryDate") || null,
          description: form.get("description"),
          internalComments: form.get("internalComments")
        })
      });
      const payload = (await response.json().catch(() => null)) as { project?: OrganizationProject; error?: string } | null;
      if (!response.ok || !payload?.project) throw new Error(payload?.error ?? "Projektet kunde inte sparas.");
      setData((current) => ({ ...current, project: payload.project as OrganizationProject }));
      if (data.project.current_stage === "setup") {
        setMessage("Projektinformationen är sparad. Nästa steg är att ladda upp underlaget.");
        selectTab("documents");
      } else {
        setMessage("Projektinformationen är sparad.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Projektet kunde inte sparas.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadTechnicalDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Välj en PDF med teknisk beskrivning.");
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      form.set("projectId", data.project.id);
      const response = await fetch("/api/technical-descriptions", { method: "POST", body: form });
      const payload = (await response.json().catch(() => null)) as { error?: string; persistedRequirementCount?: number } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Underlaget kunde inte extraheras.");
      await reload();
      await advanceProjectStage("product_matching");
      const requirementCount = payload?.persistedRequirementCount ?? 0;
      if (requirementCount > 0) {
        setMessage(`Underlaget är sparat. ${requirementCount} produktrader är klara för produktval.`);
      } else {
        setMessage("Underlaget är sparat, men inga produktrader hittades automatiskt. Prova ett tydligare dokument.");
      }
      setSelectedFileName(null);
      formElement.reset();
      selectTab("products");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Underlaget kunde inte extraheras.");
    } finally {
      setUploading(false);
    }
  }

  const technicalDocumentHashes = new Set(
    data.technicalDescriptions
      .map((item) => String(item.file_sha256 ?? ""))
      .filter(Boolean)
  );
  const distinctProjectDocuments = data.documents.filter(
    (item) =>
      !item.file_sha256 ||
      !technicalDocumentHashes.has(String(item.file_sha256))
  );
  const counts = {
    documents: distinctProjectDocuments.length + data.technicalDescriptions.length,
    requirements: data.requirements.length,
    suggestions: data.suggestions.filter(isManualAssignment).length,
    decisions: data.decisions.length
  };
  const workflow = guidedProjectWorkflow({
    documentCount: counts.documents,
    requirements: data.requirements,
    assignments: data.suggestions
  });
  const projectFinished =
    workflow.isComplete && data.project.current_stage === "completed";
  const completedVisualStepIds = workflow.completedStepIds.filter(
    (stepId) => stepId !== "result" || projectFinished
  );
  const stageProgress = Math.round(
    (completedVisualStepIds.length / GUIDED_PROJECT_STEPS.length) * 100
  );
  const selectedProductSummaries = summarizeSelectedProducts(
    data.suggestions,
    data.requirements
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {data.project.demo_data_set_id && <DemoBadge />}
      <Link
        href="/projects"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-600 transition hover:text-flow-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Alla projekt
      </Link>

      <header className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-flow-100 text-flow-700">
              <FolderKanban className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-flow-700">
                  {data.project.project_number ?? "Projekt utan nummer"}
                </p>
                <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
                  {statusLabels[data.project.status] ?? data.project.status}
                </span>
              </div>
              <h1 className="mt-2 truncate text-2xl font-semibold text-ink-950 sm:text-3xl">
                {data.project.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-600">
                <span>{data.project.customer_name ?? "Ingen kund angiven"}</span>
                {data.project.system_type && <><span aria-hidden="true">·</span><span>{data.project.system_type}</span></>}
                {data.project.standard && <><span aria-hidden="true">·</span><span>{data.project.standard}</span></>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="secondary" onClick={() => selectTab("documents")}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Underlag
            </Button>
            {workflow.isComplete && canExportMaterialList && (
              <ProjectMaterialListExportButton projectId={data.project.id} />
            )}
            <Button
              disabled={finishing}
              onClick={() =>
                workflow.isComplete
                  ? void finishProject()
                  : selectTab(workflow.nextTab)
              }
            >
              {workflow.isComplete ? (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
              {finishing
                ? "Slutför projektet..."
                : workflow.isComplete
                  ? data.project.current_stage === "completed"
                    ? "Visa projektsammanfattning"
                    : "Slutför produktvalet"
                  : workflow.nextLabel}
            </Button>
          </div>
        </div>

        <div className="border-t border-ink-100 bg-ink-50 px-5 py-5 sm:px-7">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">Arbetsflöde</p>
              <p className="mt-1 text-sm font-semibold text-ink-900">
                {projectFinished
                  ? "Alla tre steg är klara"
                  : workflow.isComplete
                    ? "Nästa: Markera projektet klart"
                  : `Nästa: ${workflow.nextLabel}`}
              </p>
            </div>
            <span className="text-sm font-semibold text-flow-700">{stageProgress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-200" aria-hidden="true">
            <div className="h-full rounded-full bg-flow-600 transition-all" style={{ width: `${stageProgress}%` }} />
          </div>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
              {GUIDED_PROJECT_STEPS.map((step, index) => {
                const completed = completedVisualStepIds.includes(step.id);
                const next = step.id === "result"
                  ? workflow.isComplete && !projectFinished
                  : !workflow.isComplete && step.tab === workflow.nextTab;
                const active = step.id === "result"
                  ? projectFinished && tab === "overview"
                  : tab === step.tab ||
                    (tab === "decisions" && step.id === "products") ||
                    (tab === "overview" && next);
                const disabled = step.id === "result" && !workflow.isComplete;
                return (
                  <li key={step.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => selectTab(step.tab)}
                      aria-current={active ? "step" : undefined}
                      className={active
                        ? "flex w-full items-center gap-3 rounded-xl border-2 border-flow-500 bg-white p-4 text-left shadow-sm transition"
                        : completed
                          ? "flex w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:border-emerald-300"
                          : "flex w-full items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 text-left text-ink-500 transition enabled:hover:border-flow-300 disabled:cursor-not-allowed disabled:opacity-60"}
                    >
                      <span className={active
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-flow-600 text-sm font-bold text-white"
                        : completed
                          ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-500"}
                      >
                        {completed && !active
                          ? <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                          : index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className={active ? "block font-semibold text-flow-950" : completed ? "block font-semibold text-emerald-950" : "block font-semibold text-ink-700"}>
                          {step.label}
                        </span>
                        <span className={active ? "mt-0.5 block text-xs font-medium text-flow-700" : completed ? "mt-0.5 block text-xs font-medium text-emerald-700" : "mt-0.5 block text-xs text-ink-500"}>
                          {active
                            ? projectFinished && step.id === "result"
                              ? "Projektet är färdigt"
                              : "Du är här"
                            : completed
                              ? "Klar"
                              : next
                                ? "Nästa steg"
                                : "Kommande"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
          </ol>
        </div>
      </header>

      {(message || error) && (
        <div role="status" aria-live="polite" className={error ? "rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800" : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800"}>
          {error ?? message}
        </div>
      )}

      <nav aria-label="Projektsektioner" className="sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-xl border border-ink-200 bg-white/95 p-1.5 shadow-sm backdrop-blur">
        {([
          ["overview", "Översikt", LayoutDashboard, null],
          ["documents", "Underlag", FileText, counts.documents],
          ["products", "Ahlsells produktval", PackageSearch, counts.suggestions],
          ["decisions", "Beslutslogg", ClipboardCheck, counts.decisions]
        ] as const).map(([key, label, Icon, count]) => (
          <button key={key} type="button" aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)} className={tab === key ? "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-flow-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm" : "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
            {count !== null && <span className={tab === key ? "rounded-full bg-white/20 px-1.5 py-0.5 text-[11px]" : "rounded-full bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-600"}>{count}</span>}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-5">
          {projectFinished ? (
            <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
              <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.1em] text-emerald-700">Projektet är färdigt</p>
                    <h2 className="mt-1 text-xl font-semibold text-emerald-950">Produktval och mängder är klara</h2>
                    <p className="mt-1 text-sm leading-6 text-emerald-800">Ladda ner materiallistan eller starta nästa tekniska analys.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canExportMaterialList && (
                    <ProjectMaterialListExportButton projectId={data.project.id} />
                  )}
                  {canCreateProject && (
                    <Link
                      href="/projects/new"
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-flow-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-flow-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow-600"
                    >
                      <FilePlus2 className="h-4 w-4" aria-hidden="true" />
                      Starta en ny analys
                    </Link>
                  )}
                </div>
              </div>
            </section>
          ) : workflow.isComplete ? (
            <section className="flex flex-col gap-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-700">En sista åtgärd</p>
                <p className="mt-1 text-base font-semibold text-emerald-950">Alla produkter är valda</p>
                <p className="mt-1 text-sm text-emerald-800">Markera projektet klart för att visa resultat och kunna starta nästa analys.</p>
              </div>
              <Button disabled={finishing} onClick={() => void finishProject()}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {finishing ? "Slutför…" : "Markera projektet klart"}
              </Button>
            </section>
          ) : (
            <section className="flex flex-col gap-4 rounded-xl border-2 border-flow-300 bg-flow-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-flow-800">Gör detta nu</p>
                <p className="mt-1 text-base font-semibold text-flow-950">{workflow.nextLabel}</p>
              </div>
              <Button onClick={() => selectTab(workflow.nextTab)}>
                Fortsätt
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </section>
          )}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Dokument" value={counts.documents} detail="Projektunderlag och tekniska beskrivningar" />
            <Metric label="Extraherade produktrader" value={counts.requirements} detail="Redo för Ahlsells produktval" tone={counts.requirements ? "success" : "warning"} />
            <Metric label="Registrerade produktval" value={counts.suggestions} detail="Produkter valda av Ahlsell" />
            <Metric label="Spårbara beslut" value={counts.decisions} detail="Godkännanden och avvikelser" />
          </section>
          <form onSubmit={saveProject} className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
            <div className="px-5 py-5 sm:px-6">
              <h2 className="font-semibold text-ink-950">Projektförutsättningar</h2>
              <p className="mt-1 text-sm text-ink-600">Grunddata som styr dokumentanalys och Ahlsells produktval.</p>
            </div>

            <fieldset className="border-t border-ink-100 px-5 py-5 sm:px-6">
              <legend className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Identitet och kund</legend>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Input id="workspace-name" name="name" label="Projektnamn" defaultValue={data.project.name} required />
                <Input id="workspace-number" name="projectNumber" label="Projektnummer" defaultValue={data.project.project_number ?? ""} />
                <Input id="workspace-customer" name="customerName" label="Kund" defaultValue={data.project.customer_name ?? ""} />
                <Input id="workspace-end-customer" name="endCustomer" label="Slutkund" defaultValue={data.project.end_customer ?? ""} />
                <Input id="workspace-address" name="address" label="Projektadress" defaultValue={data.project.address ?? ""} />
                <Input id="workspace-project-type" name="projectType" label="Projekttyp" defaultValue={data.project.project_type ?? ""} />
              </div>
            </fieldset>

            <fieldset className="border-t border-ink-100 px-5 py-5 sm:px-6">
              <legend className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Teknik och inköp</legend>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Input id="workspace-system-type" name="systemType" label="Systemtyp" defaultValue={data.project.system_type ?? ""} />
                <Input id="workspace-standard" name="standard" label="Huvudstandard" defaultValue={data.project.standard ?? ""} />
                <div className="rounded-lg border border-[#0073b6]/20 bg-[#0073b6]/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#00649e]">Distributör</p>
                  <p className="mt-1 font-semibold text-ink-950">Ahlsell</p>
                  <p className="mt-1 text-xs leading-5 text-ink-600">Produkt och tillbehör väljs direkt från de extraherade produktraderna.</p>
                </div>
                <Input id="workspace-currency" name="currency" label="Valuta" defaultValue={data.project.currency ?? "NOK"} />
                <Input id="workspace-delivery-country" name="deliveryCountry" label="Leveransland" defaultValue={data.project.delivery_country ?? ""} />
                <Input id="workspace-warehouse" name="warehouseLocation" label="Lager/distributionspunkt" defaultValue={data.project.warehouse_location ?? ""} />
              </div>
            </fieldset>

            <fieldset className="border-t border-ink-100 px-5 py-5 sm:px-6">
              <legend className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-ink-500">Planering och status</legend>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Input id="workspace-start" name="expectedStartDate" label="Förväntad start" type="date" defaultValue={data.project.expected_start_date ?? ""} />
                <Input id="workspace-delivery" name="expectedDeliveryDate" label="Förväntad leverans" type="date" defaultValue={data.project.expected_delivery_date ?? ""} />
                <label className="block" htmlFor="workspace-status"><span className="mb-2 block text-sm font-medium text-ink-700">Projektstatus</span><select id="workspace-status" name="status" defaultValue={data.project.status} className="block h-11 w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <div className="rounded-lg border border-ink-200 bg-ink-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">Nästa arbetssteg</p>
                  <p className="mt-1 text-sm font-semibold text-ink-900">{workflow.nextLabel}</p>
                  <p className="mt-1 text-xs text-ink-500">Uppdateras automatiskt när varje steg är klart.</p>
                </div>
              </div>
            </fieldset>

            <div className="grid gap-4 border-t border-ink-100 px-5 py-5 sm:px-6 md:grid-cols-2">
              <TextArea name="description" label="Projektbeskrivning" defaultValue={data.project.description ?? ""} />
              <TextArea name="internalComments" label="Interna kommentarer" defaultValue={data.project.internal_comments ?? ""} />
            </div>
            <div className="flex justify-end border-t border-ink-100 bg-ink-50 px-5 py-4 sm:px-6">
              <Button type="submit" disabled={saving}><Save className="h-4 w-4" aria-hidden="true" />{saving ? "Sparar..." : "Spara projektuppgifter"}</Button>
            </div>
          </form>
          <div className="grid gap-5 lg:grid-cols-2">
            <InfoCard title="System och standarder" icon={<CheckCircle2 className="h-5 w-5 text-flow-700" />}>
              <p className="text-sm text-ink-600">{data.systemTypes.length ? data.systemTypes.map((item) => String(item.label ?? item.system_type)).join(", ") : data.project.system_type ?? "Inga systemtyper bekräftade ännu."}</p>
              <p className="mt-2 text-sm text-ink-600">{data.standards.length ? data.standards.map((item) => `${String(item.standard_name)}${item.edition ? ` (${String(item.edition)})` : ""}`).join(", ") : data.project.standard ?? "Ingen standard bekräftad ännu."}</p>
            </InfoCard>
            <InfoCard title="Ahlsells produktval" icon={<PackageSearch className="h-5 w-5 text-[#0073b6]" />}>
              {selectedProductSummaries.length === 0 ? (
                <p className="text-sm leading-6 text-ink-600">Ingen produkt har registrerats ännu. Ahlsell registrerar artikelnummer och vanliga tillbehör direkt mot en extraherad produktrad.</p>
              ) : (
                <div className="divide-y divide-ink-100">
                  {selectedProductSummaries.map((product) => (
                    <div key={product.key} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-950">{product.name}</p>
                        <p className="mt-0.5 text-xs text-ink-500">Art.nr {product.productNumber}</p>
                      </div>
                      <span className={product.quantityMissing
                        ? "shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800"
                        : "shrink-0 rounded-full bg-[#0073b6]/10 px-2.5 py-1 text-xs font-semibold text-[#00649e]"}
                      >
                        {product.quantityLabel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-xs font-medium text-[#00649e]">Antalen hämtas direkt från den tekniska beskrivningen.</p>
            </InfoCard>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-5">
          <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 text-flow-700" aria-hidden="true" /><div><h2 className="font-semibold text-ink-950">Teknisk beskrivning</h2><p className="mt-1 text-sm text-ink-600">Ladda upp underlag direkt till projektet. Extraherade produktrader går direkt vidare till produktvalet.</p></div></div>
            <form className="mt-5" onSubmit={uploadTechnicalDescription}>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-200 bg-ink-50 px-5 py-8 text-center transition hover:border-flow-400 hover:bg-flow-50">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-flow-700 shadow-sm"><Upload className="h-5 w-5" aria-hidden="true" /></span>
                <span className="mt-3 text-sm font-semibold text-ink-900">{selectedFileName ?? "Välj en teknisk beskrivning i PDF-format"}</span>
                <span className="mt-1 text-xs text-ink-500">Max 30 MB. Dokumentet sparas privat i projektet.</span>
                <input name="file" type="file" accept=".pdf,application/pdf" className="sr-only" onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? null)} />
              </label>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink-500">Efter uppladdningen går du direkt vidare till Ahlsells produktval.</p>
                <Button type="submit" disabled={uploading || !selectedFileName}><Upload className="h-4 w-4" aria-hidden="true" />{uploading ? "Extraherar och sparar..." : "Extrahera och spara"}</Button>
              </div>
            </form>
          </section>
          <section className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-end justify-between gap-3"><div><h2 className="font-semibold text-ink-950">Dokumenthistorik</h2><p className="mt-1 text-sm text-ink-600">Status för projektets uppladdade och extraherade underlag.</p></div><span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">{counts.documents} dokument</span></div><div className="mt-4 divide-y divide-ink-100">{data.technicalDescriptions.length === 0 && distinctProjectDocuments.length === 0 ? <p className="rounded-lg bg-ink-50 px-4 py-8 text-center text-sm text-ink-600">Inga dokument är kopplade ännu. Börja med en teknisk beskrivning ovan.</p> : <>{data.technicalDescriptions.map((item) => <DocumentRow key={`technical-${item.id}`} item={item} source="Teknisk extraktion" />)}{distinctProjectDocuments.map((item) => <DocumentRow key={`project-${item.id}`} item={item} source="Projektfil" />)}</>}</div></section>
          {counts.documents > 0 && (
            <section className="flex flex-col gap-3 rounded-xl border border-flow-200 bg-flow-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-flow-950">Underlaget är sparat</p>
                <p className="mt-1 text-sm text-flow-800">Nästa steg är att registrera Ahlsells produkt och tillbehör för varje extraherad rad.</p>
              </div>
              <Button onClick={() => selectTab("products")}>
                Gå till produktval
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </section>
          )}
        </div>
      )}

      {tab === "products" && (
        <DistributorMappingPanel
          projectId={data.project.id}
          requirements={data.requirements}
          assignments={data.suggestions}
          memories={data.mappingMemories}
          memoryAccessories={data.mappingAccessories}
          onReload={reload}
          onGoToDocuments={() => selectTab("documents")}
          onFinish={() => void finishProject()}
          finishing={finishing}
          canExport={canExportMaterialList}
        />
      )}

      {tab === "decisions" && <section className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-ink-950">Beslutslogg</h2>{data.decisions.length === 0 ? <p className="mt-4 text-sm text-ink-600">Inga beslut är registrerade ännu.</p> : <div className="mt-4 divide-y divide-ink-100">{data.decisions.map((item) => <div key={item.id} className="py-4"><div className="flex justify-between gap-3"><p className="font-medium text-ink-950">{String(item.decision)}</p><span className="text-xs text-ink-500">{String(item.status)}</span></div><p className="mt-1 text-sm text-ink-600">{String(item.rationale)}</p></div>)}</div>}</section>}
    </div>
  );
}

function DocumentRow({ item, source }: { item: ProjectRow; source: string }) {
  const status = String(item.processing_status ?? item.status ?? item.extraction_method ?? "Ej behandlad");
  const ready = ["completed", "extracted", "review_required", "requires_review", "uploaded"].includes(status);
  return <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-ink-950">{String(item.file_name ?? item.fileName ?? "Dokument")}</p><span className={ready ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700" : "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"}>{documentStatusLabel(status)}</span></div><p className="mt-1 text-xs text-ink-500">{source}</p></div><span className="shrink-0 text-xs text-ink-500">{formatDate(item.created_at)}</span></div>;
}

function Metric({ label, value, detail, tone = "neutral" }: { label: string; value: number; detail: string; tone?: "neutral" | "warning" | "success" }) { const valueClass = tone === "warning" ? "text-amber-700" : tone === "success" ? "text-emerald-700" : "text-ink-950"; return <div className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500">{label}</p><p className={`mt-2 text-3xl font-semibold ${valueClass}`}>{value}</p><p className="mt-2 text-xs leading-5 text-ink-500">{detail}</p></div>; }
function InfoCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <article className="rounded-lg border border-ink-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><span>{icon}</span><h2 className="font-semibold text-ink-950">{title}</h2></div><div className="mt-4">{children}</div></article>; }
function TextArea({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) { return <label className="block"><span className="mb-2 block text-sm font-medium text-ink-700">{label}</span><textarea name={name} rows={4} defaultValue={defaultValue} className="block w-full rounded-lg border-ink-200 bg-white text-sm text-ink-900 shadow-sm focus:border-flow-500 focus:ring-flow-500" /></label>; }
function formatDate(value: unknown) { if (typeof value !== "string" || !value) return ""; return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(value)); }
function documentStatusLabel(status: string) { const labels: Record<string, string> = { completed: "Klar", extracted: "Extraherad", review_required: "Kräver granskning", requires_review: "Kräver granskning", uploaded: "Uppladdad", uploading: "Laddar upp", extracting: "Extraherar", failed: "Misslyckades" }; return labels[status] ?? status; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isManualAssignment(item: ProjectRow) {
  const snapshot = isRecord(item.product_snapshot) ? item.product_snapshot : {};
  return snapshot.source === "distributor_manual" && item.status === "selected";
}

function summarizeSelectedProducts(
  assignments: ProjectRow[],
  requirements: ProjectRow[]
) {
  const requirementsById = new Map(
    requirements.map((requirement) => [requirement.id, requirement])
  );
  const summaries = new Map<string, {
    key: string;
    name: string;
    productNumber: string;
    quantity: number;
    unit: string;
    quantityMissing: boolean;
  }>();

  for (const assignment of assignments.filter(isManualAssignment)) {
    const snapshot = isRecord(assignment.product_snapshot)
      ? assignment.product_snapshot
      : {};
    const productNumber = String(snapshot.productNumber ?? "").trim();
    const name = String(snapshot.name ?? "Produkt").trim() || "Produkt";
    const requirement = typeof assignment.requirement_id === "string"
      ? requirementsById.get(assignment.requirement_id)
      : undefined;
    const required = projectRequirementQuantity(requirement?.value_json);
    const key = `${productNumber || assignment.id}:${required.unit}`;
    const current = summaries.get(key);
    summaries.set(key, {
      key,
      name,
      productNumber: productNumber || "Saknas",
      quantity: (current?.quantity ?? 0) + (required.quantity ?? 0),
      unit: required.unit,
      quantityMissing: Boolean(current?.quantityMissing) || required.quantity === null
    });
  }

  return [...summaries.values()].map((summary) => ({
    ...summary,
    quantityLabel: summary.quantityMissing
      ? summary.quantity > 0
        ? `${formatProjectQuantity({ quantity: summary.quantity, unit: summary.unit })} + antal saknas`
        : "Antal saknas"
      : formatProjectQuantity({
          quantity: summary.quantity,
          unit: summary.unit
        })
  }));
}
